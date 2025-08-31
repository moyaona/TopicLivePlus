// ==UserScript==
// @name          TopicLive+dev
// @description   Charge les nouveaux messages d'un topic JVC en direct.
// @author        kiwec, moyaona, lantea/atlantis
// @match         https://www.jeuxvideo.com/*
// @match         https://m.jeuxvideo.com/*
// @downloadURL   https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/TopicLivePlus.user.js
// @updateURL     https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/TopicLivePlus.user.js
// @run-at        document-end
// @require       https://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js
// @icon          https://image.noelshack.com/fichiers/2025/35/4/1756403430-image.png
// @version       7.3
// @grant         none
// @noframes
// ==/UserScript==

/**
 * Représente une page de topic et gère l'analyse du DOM pour en extraire les messages.
 */
class Page {
    constructor($page) {
        this.$page = $page;
    }

    /**
     * Récupère tous les messages de la page qui ne sont pas blacklistés.
     * @returns {Message[]} Un tableau d'objets Message.
     */
    obtenirMessages() {
        const msgs = [];
        this.trouver(`${TL.class_msg}:not(.msg-pseudo-blacklist)`).each(function() {
            msgs.push(new Message($(this)));
        });
        return msgs;
    }

    /**
     * Effectue les actions de mise à jour après l'ajout de nouveaux messages (son, favicon, etc.).
     */
    maj() {
        if (localStorage.topiclive_son == 'true') {
            try {
                TL.son.play();
            } catch (err) {
                console.error(`[TopicLive+] Erreur son : ${err}`);
            }
        }
        try {
            if (!TL.ongletActif) {
                TL.updateCounters();
            }
        } catch (err) {
            console.error(`[TopicLive+] Erreur favicon (maj) : ${err}`);
        }
        try {
            this.Transformation();
        } catch (err) {
            console.error(`[TopicLive+] Erreur jsli.Transformation() : ${err}`);
        }
        const nb_messages = $(`${TL.class_msg}:not(.msg-pseudo-blacklist)`).size();
        if (nb_messages > 100) {
            $(`${TL.class_msg}:not(.msg-pseudo-blacklist)`).slice(0, nb_messages - 100).remove();
        }
        dispatchEvent(new CustomEvent('topiclive:doneprocessing', {
            'detail': {
                jvcake: TL.jvCake
            }
        }));
    }

    /**
     * Fait défiler la page jusqu'au premier message non lu.
     */
    performScroll() {
        const $firstUnreadMessage = TL.unreadMessageAnchors[0];
        if (!$firstUnreadMessage || $firstUnreadMessage.length === 0) {
            return;
        }
        const targetScrollTop = $firstUnreadMessage.offset().top - 100;
        $('html, body').animate({
            scrollTop: targetScrollTop
        }, 800);
    }

    /**
     * Fonction principale qui analyse la page à la recherche de nouveaux messages.
     */
    scan() {
        TL.ajaxTs = this.trouver('#ajax_timestamp_liste_messages').val();
        TL.ajaxHash = this.trouver('#ajax_hash_liste_messages').val();
        $('.nb-connect-fofo').text(this.trouver('.nb-connect-fofo').text());

        const isTextareaFocused = $(TL.formu.obtenirMessage()).is(':focus');
        let distanceFromBottom;
        if (isTextareaFocused) {
            distanceFromBottom = document.documentElement.scrollHeight - $(window).scrollTop();
        }

        if ($(TL.class_msg).length === 0) {
            TL.majUrl(this);
            TL.loop();
            return;
        }
        let messages_a_afficher = [];
        const nvMsgs = this.obtenirMessages();
        const isOnLastPage = $('.pagi-suivant-inactif').length > 0;
        try {
            for (let nvMsg of nvMsgs) {
                let nv = true;
                for (let ancienMsg of TL.messages) {
                    if (ancienMsg.id_message == nvMsg.id_message) {
                        nv = false;
                        ancienMsg.update(nvMsg);
                        break;
                    }
                }
                if (nv && isOnLastPage) {
                    TL.messages.push(nvMsg);
                    TL.nvxMessages++;
                    nvMsg.$message.hide();
                    nvMsg.fixAvatar();
                    nvMsg.fixBlacklist();
                    nvMsg.fixCitation(TL.ajaxTs, TL.ajaxHash);
                    nvMsg.fixDeroulerCitation();
                    nvMsg.fixImages(); // AJOUT : Correction des images/gifs
                    if (TL.mobile) {
                        nvMsg.fixMobile();
                    }
                    $(`${TL.class_pagination}:last`).before(nvMsg.$message);
                    messages_a_afficher.push({
                        message: nvMsg,
                        cancelled: false
                    });
                    dispatchEvent(new CustomEvent('topiclive:newmessage', {
                        'detail': {
                            id: nvMsg.id_message,
                            jvcake: TL.jvCake,
                            cancel: () => {
                                evt.cancelled = true;
                            }
                        }
                    }));
                }
            }
        } catch (err) {
            console.error(`[TopicLive+] Erreur nouveaux messages : ${err}`);
        }
        TL.majUrl(this);
        if (messages_a_afficher.length > 0) {
            setTimeout(() => {
                let maj = false;
                let $firstNewMessageToShow = null;
                for (let msg of messages_a_afficher) {
                    if (msg.cancelled) {
                        TL.nvxMessages--;
                    } else {
                        if (!$firstNewMessageToShow) {
                            $firstNewMessageToShow = msg.message.$message;
                        }
                        msg.message.$message.fadeIn('slow');
                        TL.addUnreadAnchor(msg.message.$message);
                        maj = true;
                    }
                }
                if (isTextareaFocused) {
                    const newScrollTop = document.documentElement.scrollHeight - distanceFromBottom;
                    $(window).scrollTop(newScrollTop);
                }
                if (maj) {
                    this.maj();
                    if (TL.isChatModeActive && !isTextareaFocused) {
                        if ($firstNewMessageToShow) {
                            const targetScrollTop = $firstNewMessageToShow.offset().top - 100;
                            $('html, body').animate({
                                scrollTop: targetScrollTop
                            }, 800);
                        }
                    } else {
                        TL.updateCounters();
                    }
                }
            }, 1000);
        }
        TL.loop();
    }

    /**
     * Transforme les éléments JvCare en liens cliquables et corrige les avatars.
     */
    Transformation() {
        $('.JvCare').each(function() {
            const $span = $(this);
            let classes = $span.attr('class');
            const href = TL.jvCake(classes);
            classes = classes.split(' ');
            const index = classes.indexOf('JvCare');
            classes.splice(index, index + 2);
            classes.unshift('xXx');
            classes = classes.join(' ');
            $span.replaceWith(`<a href="${href}" class="${classes}">${$span.html()}</a>`);
        });
        $('.user-avatar-msg').each(function() {
            const $elem = $(this);
            const newsrc = $elem.attr('data-srcset');
            if (newsrc != 'undefined') {
                $elem.attr('src', newsrc);
                $elem.removeAttr('data-srcset');
            }
        });
    }

    /**
     * Raccourci pour rechercher un élément dans le contexte de la page.
     */
    trouver(chose) {
        return this.$page.find(chose);
    }
}

/**
 * Représente une option de configuration du script dans le menu utilisateur de JVC.
 */
class TLOption {
    constructor(nom, id, defaultValue = 'true') { // Modification pour accepter une valeur par défaut
        if (localStorage.getItem(id) === null) {
            localStorage.setItem(id, defaultValue); // Utilisation de la valeur par défaut
        }
        this.actif = localStorage[id] == 'true';
        this.nom = nom;
        this.id = id;
        this.injecter();
    }

    /**
     * Injecte le code HTML de l'option dans le menu et attache les événements.
     */
    injecter() {
       let option = `<li>
            <span class="float-start">TopicLive - ${this.nom}</span>
            <input type="checkbox" class="input-on-off" id="${this.id}" ${this.actif ? 'checked' : ''}>
            <label for="${this.id}" class="btn-on-off"></label>
        </li>`;
        $('.menu-user-forum').append(option);
        this.bouton = $(`#${this.id}`);
        this.bouton.change(() => {
            this.actif = !this.actif;
            localStorage[this.id] = this.actif;
            dispatchEvent(new CustomEvent('topiclive:optionchanged', {
                'detail': {
                    id: this.id,
                    actif: this.actif
                }
            }));
        });
    }
}

/**
 * Représente un message unique du forum et ses propriétés.
 */
class Message {
    constructor($message) {
        if (TL.estMP) {
            this.id_message = 'MP';
        } else if (TL.mobile) {
            let id = $message.attr('id');
            id = id.slice(id.indexOf('_') + 1);
            this.id_message = parseInt(id, 10);
        } else {
            this.id_message = parseInt($message.attr('data-id'), 10);
        }
        this.date = $(TL.class_date, $message).text().replace(/[\r\n]|#[0-9]+$/g, '');
        this.edition = $message.find('.info-edition-msg').text();
        this.$message = $message;
        this.pseudo = $('.bloc-pseudo-msg', $message).text().replace(/[\r\n]/g, '');
        this.supprime = false;
    }

    /**
     * Corrige l'URL de l'avatar pour l'afficher correctement.
     */
    fixAvatar() {
        let avatar = this.trouver('.user-avatar-msg');
        avatar.attr('src', avatar.data('src'));
    }

    /**
     * Attache l'événement de clic pour la fonctionnalité de blacklistage.
     */
    fixBlacklist() {
        this.trouver('.bloc-options-msg > .picto-msg-tronche, .msg-pseudo-blacklist .btn-blacklist-cancel').on('click', () => {
            $.ajax({
                url: '/forums/ajax_forum_blacklist.php',
                data: {
                    id_alias_msg: this.$message.attr('data-id-alias'),
                    action: this.$message.attr('data-action'),
                    ajax_hash: $('#ajax_hash_preference_user').val()
                },
                dataType: 'json',
                success: ({
                    erreur
                }) => {
                    if (erreur && erreur.length) {
                        TL.alert(erreur);
                    } else {
                        document.location.reload();
                    }
                }
            });
        });
    }

    /**
     * Attache l'événement de clic pour la fonctionnalité de citation.
     */
    fixCitation(timestamp, hash) {
        this.$message.find('.bloc-options-msg .picto-msg-quote').on('click', () => {
            $.ajax({
                type: 'POST',
                url: '/forums/ajax_citation.php',
                data: {
                    id_message: this.id_message,
                    ajax_timestamp: timestamp,
                    ajax_hash: hash
                },
                dataType: 'json',
                timeout: 5000,
                success: ({
                    txt
                }) => {
                    const $msg = TL.formu.obtenirMessage();
                    let nvmsg = `> Le ${this.date} ${this.pseudo} a écrit :\n>`;
                    nvmsg += `${txt.split('\n').join('\n> ')}\n\n`;
                    if ($msg[0].value === '') {
                        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call($msg[0], `${nvmsg}\n`);
                    } else {
                        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call($msg[0], `${$msg[0].value}\n\n${nvmsg}`);
                    }
                    $msg[0].dispatchEvent(new Event("input", {
                        bubbles: true
                    }));
                    $msg[0].focus();
                    location.hash = '#forums-post-message-editor';
                },
                error: this.fixCitation.bind(this, timestamp, hash)
            });
        });
    }

    /**
     * Permet de déplier les citations imbriquées.
     */
    fixDeroulerCitation() {
        this.trouver('blockquote').click(function() {
            $(this).attr('data-visible', '1');
        });
    }

    /**
     * AJOUT : Corrige la source des images pour gérer la transparence et les GIFs.
     */
    fixImages() {
        this.trouver(TL.class_contenu).find('img').each(function() {
            const $img = $(this);
            const altSrc = $img.attr('alt');
            if (altSrc && (altSrc.startsWith('http') || altSrc.startsWith('//'))) {
                $img.attr('src', altSrc);
            }
        });
    }

    /**
     * Corrige l'affichage des messages sur la version mobile.
     */
    fixMobile() {
        this.trouver('.message').addClass('show-all');
    }

    /**
     * Raccourci pour rechercher un élément dans le contexte du message.
     */
    trouver(chose) {
        return this.$message.find(chose);
    }

    /**
     * Met à jour le contenu d'un message s'il a été édité.
     */
    update(nvMessage) {
        if (this.edition == nvMessage.edition) return;
        this.edition = nvMessage.edition;

        // On remplace le contenu du message.
        this.trouver(TL.class_contenu).html(nvMessage.trouver(TL.class_contenu).html());

        // On appelle la fonction qui transforme les spans JvCare en liens cliquables.
        TL.page.Transformation();

        // AJOUT : On applique la correction des images sur les messages édités.
        this.fixImages();

        dispatchEvent(new CustomEvent('topiclive:edition', {
            'detail': {
                id: this.id_message,
                jvcake: TL.jvCake
            }
        }));

        // L'animation de couleur a été supprimée.
    }
}

/**
 * Gère le formulaire de réponse, en interceptant l'envoi pour éviter le rechargement de la page.
 */
class Formulaire {
    constructor() {
        // Mémorise les jetons de session les plus récents pour éviter les erreurs.
        this.formSessionData = null;
        this.observerLeBouton('.postMessage');
    }

    /**
     * Attend que le bouton "Poster" apparaisse sur la page pour y attacher le gestionnaire d'événements.
     */
    observerLeBouton(selecteurBouton) {
        const observer = new MutationObserver((mutations, obs) => {
            if (document.querySelector(selecteurBouton)) {
                this.hook();
                obs.disconnect();
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Attache l'événement de clic au bouton "Poster" pour intercepter l'envoi.
     */
    hook() {
        const $boutonEnvoi = $('.postMessage');
        if ($boutonEnvoi.length > 0) {
            $boutonEnvoi.off('click.topiclive').on('click.topiclive', (e) => this.envoyer(e));
        }
    }

    /**
     * Récupère le "payload" de JVC, qui contient les jetons de session.
     */
    _getForumPayload() {
        try {
            return JSON.parse(atob(window.jvc.forumsAppPayload));
        } catch (e) {
            return null;
        }
    }

    _getTopicId() {
        return $('#bloc-formulaire-forum').attr('data-topic-id');
    }

    _getForumId() {
        const match = window.location.pathname.match(/forums\/(?:1|42)-(?<forumid>[0-9]+)-/);
        return match ? match.groups.forumid : null;
    }

    /**
     * Modifie la valeur de la zone de texte d'une manière compatible avec React.
     */
    _setTextAreaValue(textarea, value) {
        const prototype = Object.getPrototypeOf(textarea);
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        nativeSetter.call(textarea, value);
        textarea.dispatchEvent(new Event('input', {
            bubbles: true
        }));
    }

    /**
     * Gère l'envoi du message via AJAX et la relance automatique en cas d'erreur de session.
     */
    envoyer(e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const $boutonEnvoi = $('.postMessage');
        const $labelBouton = $boutonEnvoi.find('.postMessage__label');
        const $msgTextarea = $('#message_topic');
        const message = $msgTextarea.val();

        if (message.trim() === '') {
            TL.alert('Le message est vide.');
            return;
        }

        let dataObject = {};
        if (this.formSessionData) {
            dataObject = { ...this.formSessionData
            };
        } else {
            const forumPayload = this._getForumPayload();
            if (forumPayload && forumPayload.formSession) {
                dataObject = { ...forumPayload.formSession
                };
            } else {
                this.afficherErreurs("Impossible de récupérer les informations de session initiales.");
                return;
            }
        }

        dataObject.text = message;
        dataObject.topicId = this._getTopicId();
        dataObject.forumId = this._getForumId();
        dataObject.group = "1";
        dataObject.messageId = "undefined";
        dataObject.ajax_hash = $('#ajax_hash_liste_messages').val();

        $boutonEnvoi.prop('disabled', true);
        $labelBouton.text('Envoi...');

        const self = this;

        // Première tentative d'envoi
        $.ajax({
            type: 'POST',
            url: 'https://www.jeuxvideo.com/forums/message/add',
            data: dataObject,
            dataType: 'json',
            success: (response) => {
                // On sauvegarde les nouveaux jetons si le serveur en renvoie.
                if (response.formSession) {
                    self.formSessionData = response.formSession;
                }

                const hasSessionError = response.errors && response.errors.session;

                // Si une erreur de session est détectée, on relance automatiquement la requête.
                if (hasSessionError) {
                    let retryDataObject = { ...self.formSessionData
                    };
                    retryDataObject.text = message;
                    retryDataObject.topicId = self._getTopicId();
                    retryDataObject.forumId = self._getForumId();
                    retryDataObject.group = "1";
                    retryDataObject.messageId = "undefined";
                    retryDataObject.ajax_hash = $('#ajax_hash_liste_messages').val();

                    // Deuxième tentative (automatique)
                    $.ajax({
                        type: 'POST',
                        url: 'https://www.jeuxvideo.com/forums/message/add',
                        data: retryDataObject,
                        dataType: 'json',
                        success: (finalResponse) => {
                            if (finalResponse.errors && Object.keys(finalResponse.errors).length > 0) {
                                self.afficherErreurs(Object.values(finalResponse.errors).join('\n'));
                            } else {
                                self._setTextAreaValue($msgTextarea[0], '');
                                setTimeout(() => TL.charger(), 500);
                            }
                        },
                        error: () => self.afficherErreurs('La relance automatique a échoué (erreur réseau).'),
                        complete: () => {
                            $boutonEnvoi.prop('disabled', false);
                            $labelBouton.text('Poster');
                        }
                    });

                } else if (response.errors && Object.keys(response.errors).length > 0) {
                    self.afficherErreurs(Object.values(response.errors).join('\n'));
                    $boutonEnvoi.prop('disabled', false);
                    $labelBouton.text('Poster');
                } else {
                    // Succès du premier coup
                    self._setTextAreaValue($msgTextarea[0], '');
                    setTimeout(() => TL.charger(), 500);
                    $boutonEnvoi.prop('disabled', false);
                    $labelBouton.text('Poster');
                }
            },
            error: () => {
                self.afficherErreurs('Une erreur réseau est survenue lors de l\'envoi du message.');
                $boutonEnvoi.prop('disabled', false);
                $labelBouton.text('Poster');
            }
        });
    }

    afficherErreurs(msg) {
        TL.alert(msg);
    }
    maj($nvform) {}
    obtenirCaptcha($form) {}
    obtenirMessage($form) {
        if (typeof $form == 'undefined') $form = this.obtenirFormulaire();
        return $form.find(TL.estMP ? '#message' : '#message_topic');
    }
    obtenirFormulaire($page) {
        if (typeof $page === 'undefined') $page = $(document);
        return $page.find(TL.estMP ? '#repondre-mp > form' : '#forums-post-message-editor');
    }
    verifEnvoi(data) {}
    verifMessage() {}
    trouver(chose) {
        return this.obtenirFormulaire().find(chose);
    }
}

/**
 * Gère la création et la mise à jour de la favicon de la page pour afficher un compteur.
 */
class Favicon {
    constructor() {
        try {
            this.imageLoaded = false;
            this.pendingText = '';
            this.canv = $('<canvas>').get(0);
            this.canv.width = 192;
            this.canv.height = 192;
            this.context = this.canv.getContext('2d');
            this.image = new Image();
            this.image.onload = () => {
                this.imageLoaded = true;
                if (this.pendingText) {
                    this.maj(this.pendingText);
                }
            };
            this.image.src = 'https://www.jeuxvideo.com/favicon.png';
            this.maj('');
        } catch (err) {
            console.error(`[TopicLive+] Erreur init favicon : ${err}`);
        }
    }

    clear() {
        this.context.clearRect(0, 0, this.canv.width, this.canv.height);
        if (this.imageLoaded) {
            this.context.drawImage(this.image, 0, 0);
        }
    }

    maj(txt) {
        this.pendingText = txt;
        if (!this.imageLoaded) {
            return;
        }
        this.clear();
        if (txt && txt !== '') {
            const radius = 70;
            const borderWidth = 8;
            const centerX = radius + borderWidth;
            const centerY = radius + borderWidth;
            const font = 'bold 120px Arial Black';
            const verticalTextOffset = 8;
            const shadowOffset = 6;
            this.context.beginPath();
            this.context.arc(centerX, centerY, radius + borderWidth, 0, 2 * Math.PI);
            this.context.fillStyle = 'white';
            this.context.fill();
            this.context.beginPath();
            this.context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            this.context.fillStyle = '#0074ff';
            this.context.fill();
            this.context.font = font;
            this.context.textAlign = 'center';
            this.context.textBaseline = 'middle';
            this.context.fillStyle = 'black';
            this.context.fillText(txt, centerX + shadowOffset, centerY + verticalTextOffset + shadowOffset);
            this.context.fillStyle = 'white';
            this.context.fillText(txt, centerX, centerY + verticalTextOffset);
        }
        this.replace();
    }

    replace() {
        $('link[rel*="icon"]').remove();
        this.lien = $('<link>', {
            href: this.canv.toDataURL('image/png'),
            rel: 'shortcut icon',
            type: 'image/png'
        });
        $('head').append(this.lien);
    }
}

/**
 * Classe principale qui orchestre l'ensemble du script.
 */
class TopicLive {
    constructor() {
        this.instance = 0;
        this.ongletActif = !document.hidden;
        this.unreadMessageAnchors = [];
        this.isChatModeActive = false;
        this.lastScrollTop = 0;
    }

    /**
     * Ajoute les options du script au menu utilisateur de JVC.
     */
    ajouterOptions() {
        if (this.mobile) return;
        this.options = {
            optionSon: new TLOption('Son', 'topiclive_son', 'false'), // Son désactivé par défaut
            optionFavicon: new TLOption('Compteur Favicon', 'topiclive_favicon'),
            optionScrollButton: new TLOption('Bouton "Nouveaux messages"', 'topiclive_scrollbutton')
        };
    }

    /**
     * Lance une requête AJAX pour récupérer la dernière version de la page du topic.
     */
    charger() {
        if (this.oldInstance != this.instance) {
            return;
        }
        TL.GET(data => {
            new Page(data).scan();
        });
    }

    /**
     * Initialise le script sur la page actuelle.
     */
    init() {
        if (typeof $ === 'undefined') {
            return;
        }
        if (this.$tl_button) this.$tl_button.hide();
        this.isChatModeActive = false;
        this.nvxMessages = 0;
        this.unreadMessageAnchors = [];
        this.lastScrollTop = 0;

        const analysable = document.URL.match(/\/forums\/42-/);
        if (!analysable) {
            return;
        }
        this.instance++;
        this.ajaxTs = $('#ajax_timestamp_liste_messages').val();
        this.ajaxHash = $('#ajax_hash_liste_messages').val();
        this.estMP = false;
        this.url = document.URL;
        this.mobile = document.URL.includes('//m.jeuxvideo.com');
        this.class_msg = this.mobile ? '.post' : '.bloc-message-forum';
        this.class_num_page = this.mobile ? '.num-page' : '.page-active';
        this.class_page_fin = this.mobile ? '.right-elt > a' : '.pagi-fin-actif';
        this.class_date = this.mobile ? '.date-post' : '.bloc-date-msg';
        this.class_contenu = this.mobile ? '.contenu' : '.bloc-contenu';
        this.class_pagination = this.mobile ? '.pagination-b' : '.bloc-pagi-default';
        this.ajouterOptions();
        if ($(this.class_msg).length > 0) {
            this.page = new Page($(document));
            this.formu = new Formulaire();
            this.messages = this.page.obtenirMessages();
            this.updateDesktopButtonPosition();
            this.updateCounters();
            this.page.scan();
            this.loop();
        }
    }

    /**
     * Crée et configure le bouton flottant "Nouveaux messages / Revenir au direct".
     */
    initScrollButton() {
        const buttonCss = `
            #topiclive-button {
                z-index: 1000;
                font-weight: bold;
                color: white;
                background-color: rgba(22, 22, 22, 0.3);
                border: 1px solid rgba(74, 74, 74, 1);
                backdrop-filter: blur(3px);
                -webkit-backdrop-filter: blur(3px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                cursor: pointer;
                display: flex;
                align-items: center;
                height: 40px;
                width: 40px;
                border-radius: 50%;
                padding: 0;
                justify-content: center;
                transform: translateZ(0);
                transition: width 0.3s ease, padding 0.3s ease, border-radius 0.3s ease, background-color 0.2s ease, transform 0.2s ease;
            }
            #topiclive-button:hover {
                background-color: rgba(40, 40, 40, 0.9);
                transform: translateY(-2px);
            }
            #topiclive-button:active {
                transform: translateY(1px);
            }
            #topiclive-button.has-unread-messages {
                width: auto;
                padding: 0 10px 0 8px;
                border-radius: 50px;
            }
            #topiclive-button .topiclive-counter {
                font-size: 13px;
                background-color: #007bff;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                line-height: 24px;
                text-align: center;
                margin-right: 8px;
                transform: scale(0);
                transition: transform 0.2s 0.1s ease, opacity 0.2s 0.1s ease, width 0.3s ease;
                opacity: 0;
                width: 0;
                overflow: hidden;
                display: none;
            }
            #topiclive-button.has-unread-messages .topiclive-counter {
                display: block;
                transform: scale(1);
                opacity: 1;
                width: 24px;
            }
            #topiclive-button .topiclive-arrow {
                font-size: 20px;
                line-height: 1;
                transition: transform 0.3s ease;
            }
        `;
        $('head').append(`<style>${buttonCss}</style>`);
        this.$tl_button = $('<button id="topiclive-button"><span class="topiclive-counter"></span><span class="topiclive-arrow">↓</span></button>').hide();
        $('body').append(this.$tl_button);

        this.$tl_button.on('click', () => {
            if (this.nvxMessages > 0) {
                this.page.performScroll();
            } else {
                this.isChatModeActive = true;
                const $lastMessage = $(`${TL.class_msg}:last`);
                if ($lastMessage.length > 0) {
                    const targetScrollTop = $lastMessage.offset().top - 100;
                    $('html, body').animate({
                        scrollTop: targetScrollTop
                    }, 800);
                }
                this.updateCounters();
            }
        });
        $(window).on('scroll', () => {
            this.updateDesktopButtonPosition();
            const st = $(window).scrollTop();
            if (st < this.lastScrollTop) {
                if (this.isChatModeActive) {
                    this.isChatModeActive = false;
                }
            }
            this.lastScrollTop = st;
            if (this.unreadMessageAnchors.length === 0) {
                this.updateCounters();
                return;
            }
            const viewportBottom = $(window).scrollTop() + $(window).height();
            const messagesJustRead = [];
            for (const $message of this.unreadMessageAnchors) {
                const messageBottom = $message.offset().top + $message.outerHeight();
                if (viewportBottom >= messageBottom) {
                    messagesJustRead.push($message);
                }
            }
            if (messagesJustRead.length > 0) {
                this.unreadMessageAnchors = this.unreadMessageAnchors.filter($anchor => !messagesJustRead.some($read => $read.is($anchor)));
                this.nvxMessages -= messagesJustRead.length;
                if (this.nvxMessages <= 0) {
                    this.nvxMessages = 0;
                    this.isChatModeActive = true;
                }
            }
            this.updateCounters();
        });
        $(window).on('resize', () => this.updateDesktopButtonPosition());
    }

    /**
     * Ajuste la position du bouton flottant pour s'adapter à la largeur de la fenêtre.
     */
    updateDesktopButtonPosition() {
        if (this.mobile || $(window).width() < 1250) {
            const mobileStyle = {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                left: 'auto',
                top: 'auto',
                transform: 'none'
            };
            this.$tl_button.css(mobileStyle);
        } else {
            const $container = $('.conteneur-messages-pagi');
            if ($container.length > 0) {
                const buttonLeft = $container.offset().left + $container.outerWidth() + 15;
                const desktopStyle = {
                    position: 'fixed',
                    bottom: '25px',
                    left: buttonLeft + 'px',
                    right: 'auto',
                    top: 'auto',
                    transform: 'none'
                };
                this.$tl_button.css(desktopStyle);
            }
        }
    }

    /**
     * Met à jour l'état du bouton flottant et le compteur de la favicon.
     */
    updateCounters() {
        let countText = '';
        if (this.nvxMessages > 0) {
            countText = this.nvxMessages > 99 ? '99+' : `${this.nvxMessages}`;
        }
        if (this.options && this.options.optionFavicon.actif) {
            this.favicon.maj(countText);
        }
        if (this.options && this.options.optionScrollButton.actif) {
            const isOnLastPage = $('.pagi-suivant-inactif').length > 0;
            if (this.nvxMessages > 0) {
                this.$tl_button.find('.topiclive-counter').text(countText);
                this.$tl_button.addClass('has-unread-messages').fadeIn();
            } else if (!this.isChatModeActive && isOnLastPage) {
                this.$tl_button.removeClass('has-unread-messages').fadeIn();
            } else {
                this.$tl_button.fadeOut();
            }
        } else if (this.$tl_button) {
            this.$tl_button.fadeOut();
        }
    }

    markAllAsRead() {
        this.nvxMessages = 0;
        this.unreadMessageAnchors = [];
        this.updateCounters();
    }

    addUnreadAnchor($message) {
        this.unreadMessageAnchors.push($message);
    }

    /**
     * Point d'entrée principal du script, initialise les composants statiques.
     */
    initStatic() {
        this.favicon = new Favicon();
        this.son = new Audio('https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/notification_sound_tl.mp3');
        this.suivreOnglets();
        this.initScrollButton();
        this.init();
        addEventListener('instantclick:newpage', this.init.bind(this));
        addEventListener('topiclive:optionchanged', (e) => {
            const {
                id,
                actif
            } = e.detail;
            if (id === 'topiclive_favicon' && !actif) {
                this.favicon.maj('');
            }
            if (id === 'topiclive_scrollbutton' && !actif) {
                this.$tl_button.fadeOut();
            }
        });
        $("head").append(`
            <style type='text/css'>
                .topiclive-loading:after { content: ' ○' }
                .topiclive-loaded:after { content: ' ●' }
            </style>
        `);
        console.log('[TopicLive+] : activé');
    }

    /**
     * Décode les classes JvCare pour obtenir une URL.
     */
    jvCake(classe) {
        const base16 = '0A12B34C56D78E9F';
        let lien = '';
        const s = classe.split(' ')[1];
        for (let i = 0; i < s.length; i += 2) {
            lien += String.fromCharCode(base16.indexOf(s.charAt(i)) * 16 + base16.indexOf(s.charAt(i + 1)));
        }
        return lien;
    }

    /**
     * Affiche une alerte à l'utilisateur.
     */
    alert(message) {
        try {
            modal('erreur', {
                message
            });
        } catch (err) {
            alert(message);
        }
    }

    /**
     * Boucle principale de rafraîchissement.
     */
    loop() {
        if (typeof this.idanalyse !== 'undefined') window.clearTimeout(this.idanalyse);
        let duree = this.ongletActif ? 5000 : 10000;
        if (this.mobile) duree = 10000;
        this.oldInstance = this.instance;
        this.idanalyse = setTimeout(this.charger.bind(this), duree);
    }

    /**
     * Met à jour l'URL à rafraîchir pour toujours pointer vers la dernière page.
     */
    majUrl(page) {
        if (this.estMP) return;
        const $bouton = page.trouver(this.class_page_fin);
        const numPage = page.trouver(`${this.class_num_page}:first`).text();
        const testUrl = this.url.split('-');
        if ($bouton.length > 0) {
            this.messages = [];
            if ($bouton.prop('tagName') == 'A') {
                this.url = $bouton.attr('href');
            } else {
                this.url = this.jvCake($bouton.attr('class'));
            }
        } else if (testUrl[3] != numPage) {
            this.messages = [];
            testUrl[3] = numPage;
            this.url = testUrl.join('-');
        }
    }

    /**
     * Détecte les changements de visibilité de l'onglet.
     */
    suivreOnglets() {
        document.addEventListener('visibilitychange', () => {
            this.ongletActif = !document.hidden;
        });
    }

    /**
     * Wrapper pour la requête AJAX de récupération de la page.
     */
    GET(cb) {
        const blocChargement = this.mobile ? $('.bloc-nom-sujet:last > span') : $('#bloc-formulaire-forum .titre-bloc');
        blocChargement.addClass('topiclive-loading');
        window.clearTimeout(this.idanalyse);
        $.ajax({
            type: 'GET',
            url: this.url,
            timeout: 5000,
            success: data => {
                if (this.oldInstance != this.instance) {
                    return;
                }
                blocChargement.removeClass('topiclive-loading');
                blocChargement.addClass('topiclive-loaded');
                cb($(data.substring(data.indexOf('<!DOCTYPE html>'))));
                setTimeout(() => {
                    blocChargement.removeClass('topiclive-loaded');
                }, 100);
                TL.loop();
            },
            error: () => {
                TL.loop();
            }
        });
    }
}

// Lancement du script
var TL = new TopicLive();
TL.initStatic();
