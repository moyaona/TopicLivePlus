// ==UserScript==
// @name          TopicLive+
// @namespace     TopicLive+JVC
// @description   Charge les nouveaux messages d'un topic JVC en direct.
// @author        moyaona, lantea/atlantis, kiwec
// @match         https://www.jeuxvideo.com/*
// @match         https://m.jeuxvideo.com/*
// @downloadURL   https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/TopicLivePlus.user.js
// @updateURL     https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/TopicLivePlus.user.js
// @run-at        document-end
// @require       https://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js
// @icon          https://image.noelshack.com/fichiers/2025/35/4/1756403430-image.png
// @version       7.7
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
                    nvMsg.initPartialQuote(); // On attache la fonction aux nouveaux messages
                    nvMsg.fixDeroulerCitation();
                    nvMsg.fixImages();
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
                    const datePropre = this.date.trim().replace(/\s+/g, ' '); /** trim pour nettoyer la citation **/
                    const pseudoPropre = this.pseudo.trim().replace(/\s+/g, ' ');

                    let nvmsg = `> Le ${datePropre} ${pseudoPropre} a écrit :\n>`;
                    nvmsg += `${txt.split('\n').join('\n> ')}\n\n`;

                    if ($msg[0].value === '') {
                        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call($msg[0], `${nvmsg}\n`);
                    } else {
                        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call($msg[0], `${$msg[0].value}\n\n${nvmsg}`);
                    }
                    $msg[0].dispatchEvent(new Event("input", {
                        bubbles: true
                    }));
                     location.hash = '#forums-post-message-editor';

                    setTimeout(() => { //focus post citations
                    $msg[0].focus();
                    }, 50);
                },
                error: this.fixCitation.bind(this, timestamp, hash)
            });
        });
    }

             /**
     * Initialise les écouteurs d'événements pour la citation partielle sur ce message.
     */
    initPartialQuote() {
        const partialQuoteEvent = async (pointerEvent) => {
            await new Promise(resolve => setTimeout(resolve, 50));
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            if (!selectedText.length) return;

            const messageContentNode = this.trouver(TL.class_contenu)[0];
            const selectionContainer = selection.getRangeAt(0).commonAncestorContainer;
            if (!messageContentNode.contains(selectionContainer)) {
                return;
            }

            TL.$partialQuoteButton[0].onclick = () => this.buildPartialQuote(selectedText);

            const rect = selection.getRangeAt(0).getBoundingClientRect();

            // Top: On se base sur le BAS de la sélection, en ajoutant un décalage pour le triangle.
            const top = rect.bottom + window.scrollY + 10;
            // Left: On se base sur le CENTRE HORIZONTAL de la sélection.
            const left = rect.left + (rect.width / 2) + window.scrollX;

            TL.$partialQuoteButton.css({
                top: `${top}px`,
                left: `${left}px`
            }).addClass('active');
        };

        this.$message[0].onpointerup = (pe) => partialQuoteEvent(pe);
        this.$message[0].oncontextmenu = (pe) => partialQuoteEvent(pe);
    }

    /**
     * Construit et insère la citation partielle dans la zone de texte.
     */
    buildPartialQuote(selection) {
        const textarea = TL.formu.obtenirMessage()[0];
        if (!textarea) return;

        const datePropre = this.date.trim().replace(/\s+/g, ' ');
        const pseudoPropre = this.pseudo.trim().replace(/\s+/g, ' ');

        const newQuoteHeader = `> Le ${datePropre} ${pseudoPropre} a écrit :`;
        const quotedText = selection.replace(/\n/g, '\n> ');
        const fullQuote = `${newQuoteHeader}\n> ${quotedText}\n\n`;

        const currentContent = textarea.value.length === 0 ? '' : `${textarea.value.trim()}\n\n`;

        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, `${currentContent}${fullQuote}`);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        TL.$partialQuoteButton.removeClass('active');
    }

    /**
     * Permet de déplier les citations imbriquées.
     */
   fixDeroulerCitation() {
         this.trouver('.text-enrichi-forum > blockquote.blockquote-jv > blockquote').each(function () {
             const $quote = $(this);
    // Ajoute le bouton nested-quote-toggle-box au blocquote
             const $buttonOpenQuote = $('<div class="nested-quote-toggle-box"></div>');
             $quote.prepend($buttonOpenQuote);
    // Attache le listener
             $buttonOpenQuote.on('click', function () {
                 const $blockquote = $buttonOpenQuote.closest('.blockquote-jv');
                 const visible = $blockquote.attr('data-visible');
                 $blockquote.attr('data-visible', visible === '1' ? '' : '1');
             });
         });
     }

    /**
     * Corrige la source des images pour gérer la transparence et les GIFs.
     */
    fixImages() {
        this.trouver(TL.class_contenu).find('img').each(function() {
            const $img = $(this);
            const src = $img.attr('src');
            const extension = $img.attr('alt').split('.').pop(); // alt pour extension
            if (src && src.includes('/minis/')) {
                const direct = src.replace(/\/minis\/(.*)\.\w+$/, `/fichiers/$1.${extension}`);
                $img.attr('src', direct);
                $img.css('object-fit', 'contain');
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
    // On applique la correction des images sur les messages édités.
        this.fixImages();

        dispatchEvent(new CustomEvent('topiclive:edition', {
            'detail': {
                id: this.id_message,
                jvcake: TL.jvCake
            }
        }));
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
   // Attend que le bouton "Poster" apparaisse sur la page pour y attacher le gestionnaire d'événements.
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
    // Attache l'événement de clic au bouton "Poster" pour intercepter l'envoi.
    hook() {
        const $boutonEnvoi = $('.postMessage');
        if ($boutonEnvoi.length > 0) {
            $boutonEnvoi.off('click.topiclive').on('click.topiclive', (e) => this.envoyer(e));
        }
    }
    // Récupère le "payload" de JVC, qui contient les jetons de session.
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
    // Modifie la valeur de la zone de texte d'une manière compatible avec React.
    _setTextAreaValue(textarea, value) {
        const prototype = Object.getPrototypeOf(textarea);
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        nativeSetter.call(textarea, value);
        textarea.dispatchEvent(new Event('input', {
            bubbles: true
        }));
    }
    // Gère l'envoi du message via AJAX et la relance automatique en cas d'erreur de session.
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
            dataObject = { ...this.formSessionData };
        } else {
            const forumPayload = this._getForumPayload();
            if (forumPayload && forumPayload.formSession) {
                dataObject = { ...forumPayload.formSession };
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
                    let retryDataObject = { ...self.formSessionData };
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
                                // Succès du premier coup
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
   // Cloudflare favicon
    setCloudflareIcon() {
        const cloudflareLogo = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTkuMzUgMTAuMDRDMTguNjcgNi41OSAxNS42NCA0IDEyIDRDOS4xMSA0IDYuNiA1LjY0IDUuMzUgOC4wNEMyLjM0IDguMzYgMCAxMC45MSAwIDE0QzAgMTcuNzEgMi42OSAyMCA2IDIwSDE5QzIxLjc2IDIwIDI0IDE3Ljc2IDI0IDE1QzI0IDEyLjM2IDIxLjk1IDEwLjIyIDE5LjM1IDEwLjA0WiIgZmlsbD0iI0Y0ODAyMiIvPjwvc3ZnPg==';
        $('link[rel*="icon"]').remove();
        this.lien = $('<link>', {
            href: cloudflareLogo,
            rel: 'shortcut icon',
            type: 'image/svg+xml'
        });
        $('head').append(this.lien);
    }
  // 410 favicon
    set410Icon() {
        const errorIcon16 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAALEUExURUxpcf7ihv/0oeuVNfK1Xv7/wf//6uqPMPS3WvzRff/Vc/nOfv/sh//Pbf3WdEI9Rv7iiP7ce//2rv/Nb/zknv/bevutMv/gkv/wrPzgmfbFcvrXjPzkmv7xq//hf//skP3cgv/mhfGvVP/shF1KOXZNMP/Xff3poP/FYf/AXPmaDf/rhO2ePa+Viv/legAPPf62SvvQd/6NFS0rN/SkPfvZiNp0FoZFD7VUFf7ecf6UGP+fIur//xwYIvOIFuiKH+yIGY6Ki59rPi8rM/+dG1JPXXpwY56hqtyxZ+eQKfvTdURDUEZEUF5cZ/n39pZaHU1JUvnWgv7caIqHjXh5hTk4Q9t7F3dzd0FEVTw6RZViOpaUlpqYm/2QE+aGGEkyJI1pTE9MUtTT02daUyorOX99gPSMGBYVIv+REfCLGP+mDPmLFLFuJWRfYuqHFko3LuKEGEZCSf3ajf71s//4uP/riP/qhv/Zdf/lg//efP/1t//qn/3Sb//ll926b/vGbf/NavfWdP/0o/3iesiaXP/pgv/ddP/XcNSfV/q3VvK4VuvDav7uov/BUv/jeP/fdMSUV//aaLNpGv/rkP3GS/+ySN6QH+OvR//faP/ecP/HNP+yJ+aqMf2jIf66KfS3IvmZJKlnG7FiDfzigP/GKNqIGv6UFumNK2tna/+wJvC9Qv/AJuq0OCMiMP+nIvnOX/6kIpSGaC8wR//mdOyQGZ+WkkpLW4d/eO6dGy8sNsybN7qNPfilII2QnHhoXe3s7NbX24JqULO5x519UKCenyktQ66HSjk1Pv6TFG1rcLSwrj9EXS8qL83MzSEeJ8vKzmpmayMfKGRpfjo/TpWYpyomLY6OltDPzzQxOUFAU3x6fmxwfI6KjRscKZORlWpoctTT1Lu9wpqYm42Lj/+YHnJucp6eojc0PS8rMjU0PtiFJPONGDdGz4cAAABxdFJOUwCN+hdmAgIBAwL97P38aAIDY/392/4V/v7bdLu77P78cf2R/QIDAuX9+hj8agf9HP1ybK/nthuaGv7w/AHz4Ha9/uHY/aL9/LX+2kmW/vz9ytr+/fxveP7+bPz8+P7A/v3++/6I/r79AdwWdeb93X3+CABJWgAAAAlwSFlzAAALEwAACxMBAJqcGAAAARtJREFUGNMBEAHv/gAAABAAFiAcFBkbGgMACAcAAAAFABEdehh7fRdyCwQACQAABgABdBIfIR4VCg0TfyIAJgAADnMCDHV4eXd8gCgpiSwAACongiN2foGGh4iKjTCVNDYAMYwrhYOEi5GUkpabnTugPwA1ky6Oj5CXmp6ipamwRKZAAFGjOZmYnJ+kq7i8rrRJpz4ASrNSr6qsurvGw8G+tU22QgBIsUa30NnU0svCxb3AU61QAEWyVM/W3+Da2M3Hyb9XcUMATLlb197n4+LV3MzEyk6oPQBV0VxiZejm4d3b01hHQXEzAEvOYeXpZ21jX2BaT6E3Ly0APFlkb2zqcOvkXcg6MgAAJAAAAGgAamtmaW5eVjgAJQ8Ah7RsxA/wK1MAAABXelRYdFJhdyBwcm9maWxlIHR5cGUgaXB0YwAAeJzj8gwIcVYoKMpPy8xJ5VIAAyMLLmMLEyMTS5MUAxMgRIA0w2QDI7NUIMvY1MjEzMQcxAfLgEigSi4A6hcRdPJCNZUAAAAASUVORK5CYII=';
        $('link[rel*="icon"]').remove();
        this.lien = $('<link>', {
            href: errorIcon16,
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
        this.isBlocked = false;
        this.is410 = false;
        this.$partialQuoteButton = null;
    }
  // Options menu
    ajouterOptions() {
        if (this.mobile) return;
        this.options = {
            optionSon: new TLOption('Son', 'topiclive_son', 'false'), // son off par défaut
            optionFavicon: new TLOption('Compteur Favicon', 'topiclive_favicon'),
            optionScrollButton: new TLOption('Bouton "Nouveaux messages"', 'topiclive_scrollbutton')
        };
    }
  // Lance une requête AJAX pour récupérer la dernière version de la page du topic.
    charger() {
        if (this.oldInstance != this.instance) {
            return;
        }
        TL.GET(data => {
            new Page(data).scan();
        });
    }
  // Initialise le script sur la page actuelle.
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
  // Crée et configure le bouton flottant "Nouveaux messages / Revenir au direct".
    initScrollButton() {
        const buttonCss = `
            #topiclive-button {
                z-index: 1000; font-weight: bold; color: white; background-color: rgba(22, 22, 22, 0.3);
                border: 1px solid rgba(74, 74, 74, 1); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); cursor: pointer; display: flex; align-items: center;
                height: 40px; width: 40px; border-radius: 50%; padding: 0; justify-content: center; transform: translateZ(0);
                transition: width 0.3s ease, padding 0.3s ease, border-radius 0.3s ease, background-color 0.2s ease, transform 0.2s ease;
            }
            #topiclive-button:hover { background-color: rgba(40, 40, 40, 0.9); transform: translateY(-2px); }
            #topiclive-button:active { transform: translateY(1px); }
            #topiclive-button.has-unread-messages { width: auto; padding: 0 10px 0 8px; border-radius: 50px; }
            #topiclive-button .topiclive-counter {
                font-size: 13px; background-color: #007bff; border-radius: 50%; width: 24px; height: 24px;
                line-height: 24px; text-align: center; margin-right: 8px; transform: scale(0);
                transition: transform 0.2s 0.1s ease, opacity 0.2s 0.1s ease, width 0.3s ease;
                opacity: 0; width: 0; overflow: hidden; display: none;
            }
            #topiclive-button.has-unread-messages .topiclive-counter { display: block; transform: scale(1); opacity: 1; width: 24px; }
            #topiclive-button .topiclive-arrow { font-size: 20px; line-height: 1; transition: transform 0.3s ease; }
        `;
        $('head').append(`<style>${buttonCss}</style>`);
        this.$tl_button = $('<button id="topiclive-button"><span class="topiclive-counter"></span><span class="topiclive-arrow">↓</span></button>').hide();
        this.$tl_button.get(0).TL = this;
        $('body').append(this.$tl_button);

        this.$tl_button.on('click', () => {
            if (this.nvxMessages > 0) {
                this.page.performScroll();
            } else {
                this.isChatModeActive = true;
                const $lastMessage = $(`${TL.class_msg}:last`);
                if ($lastMessage.length > 0) {
                    const targetScrollTop = $lastMessage.offset().top - 100;
                    $('html, body').animate({ scrollTop: targetScrollTop }, 800);
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
      // Citation partielle d'un nouveau message
            initPartialQuoteSystem() {
        const buttonHTML = '<button id="tl-partial-quote-button"></button>';
        const buttonCSS = `
            #tl-partial-quote-button {
                background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAEVJREFUeNpiYBgFFANGbIL/gQCuAAhwiYEAE6UuoI0BSE78gE8MpwFA7yZAmRvwiTHg0NwAxOeBuACIFXCJjQIqAoAAAwDEvS2y79EjywAAAABJRU5ErkJggg==) no-repeat;
                background-color: rgb(3, 94, 191);
                background-position: -1px -1px;
                border: 0;
                border-bottom: solid 2px rgb(2, 63, 128);
                border-radius: 2px;
                box-sizing: content-box;
                cursor: pointer;
                height: 16px;
                width: 16px;
                padding: 0;
                position: absolute;
                display: none;
                z-index: 1001;
                transform: translateX(-50%);
            }
            #tl-partial-quote-button.active {
                display: block;
                animation: tl-quote-pop 0.2s ease-out;
            }
            #tl-partial-quote-button:after {
                content: "";
                position: absolute;
                width: 0;
                height: 0;
                border-left: 8px solid transparent;
                border-right: 8px solid transparent;
                border-bottom: 8px solid rgb(3, 94, 191);
                top: -8px;
                left: 50%;
                transform: translateX(-50%);
            }

            @keyframes tl-quote-pop {
                0% { transform: translateX(-50%) scale(0.8); opacity: 0; }
                70% { transform: translateX(-50%) scale(1.1); opacity: 1; }
                100% { transform: translateX(-50%) scale(1.0); }
            }
        `;
        $('head').append(`<style>${buttonCSS}</style>`);
        this.$partialQuoteButton = $(buttonHTML).appendTo('body');

        $(document).on('pointerdown', (e) => {
            if (!$(e.target).is('#tl-partial-quote-button')) {
                this.$partialQuoteButton.removeClass('active');
            }
        });
    }
       // Ajuste la position du bouton flottant pour s'adapter à la largeur de la fenêtre.
    updateDesktopButtonPosition() {
        if (this.mobile || $(window).width() < 1250) {
            this.$tl_button.css({ position: 'fixed', bottom: '20px', right: '20px', left: 'auto', top: 'auto', transform: 'none' });
        } else {
            const $container = $('.conteneur-messages-pagi');
            if ($container.length > 0) {
                const buttonLeft = $container.offset().left + $container.outerWidth() + 15;
                this.$tl_button.css({ position: 'fixed', bottom: '25px', left: buttonLeft + 'px', right: 'auto', top: 'auto', transform: 'none' });
            }
        }
    }
       // Met à jour l'état du bouton flottant et le compteur de la favicon.
    updateCounters() {
        if (this.isBlocked) { // erreur Cloudflare
            const $counter = this.$tl_button.find('.topiclive-counter');
            const cloudflareLogo = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTkuMzUgMTAuMDRDMTguNjcgNi41OSAxNS42NCA0IDEyIDRDOS4xMSA0IDYuNiA1LjY0IDUuMzUgOC4wNEMyLjM0IDguMzYgMCAxMC45MSAwIDE0QzAgMTcuMzEgMi42OSAyMCA2IDIwSDE5QzIxLjc2IDIwIDI0IDE3Ljc2IDI0IDE1QzI0IDEyLjM2IDIxLjk1IDEwLjIyIDE5LjM1IDEwLjA0WiIgZmlsbD0iI0Y0ODAyMiIvPjwvc3ZnPg==';
            $counter.html('').css({ 'background-color': '#ffffff', 'background-image': `url("${cloudflareLogo}")`, 'background-size': '16px 16px', 'background-repeat': 'no-repeat', 'background-position': 'center' });
            this.$tl_button.addClass('has-unread-messages').fadeIn();
            return;
        }

        if (this.is410) { // erreur 410
            const $counter = this.$tl_button.find('.topiclive-counter');
            const errorIcon16 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAALEUExURUxpcf7ihv/0oeuVNfK1Xv7/wf//6uqPMPS3WvzRff/Vc/nOfv/sh//Pbf3WdEI9Rv7iiP7ce//2rv/Nb/zknv/bevutMv/gkv/wrPzgmfbFcvrXjPzkmv7xq//hf//skP3cgv/mhfGvVP/shF1KOXZNMP/Xff3poP/FYf/AXPmaDf/rhO2ePa+Viv/legAPPf62SvvQd/6NFS0rN/SkPfvZiNp0FoZFD7VUFf7ecf6UGP+fIur//xwYIvOIFuiKH+yIGY6Ki59rPi8rM/+dG1JPXXpwY56hqtyxZ+eQKfvTdURDUEZEUF5cZ/n39pZaHU1JUvnWgv7caIqHjXh5hTk4Q9t7F3dzd0FEVTw6RZViOpaUlpqYm/2QE+aGGEkyJI1pTE9MUtTT02daUyorOX99gPSMGBYVIv+REfCLGP+mDPmLFLFuJWRfYuqHFko3LuKEGEZCSf3ajf71s//4uP/riP/qhv/Zdf/lg//efP/1t//qn/3Sb//ll926b/vGbf/NavfWdP/0o/3iesiaXP/pgv/ddP/XcNSfV/q3VvK4VuvDav7uov/BUv/jeP/fdMSUV//aaLNpGv/rkP3GS/+ySN6QH+OvR//faP/ecP/HNP+yJ+aqMf2jIf66KfS3IvmZJKlnG7FiDfzigP/GKNqIGv6UFumNK2tna/+wJvC9Qv/AJuq0OCMiMP+nIvnOX/6kIpSGaC8wR//mdOyQGZ+WkkpLW4d/eO6dGy8sNsybN7qNPfilII2QnHhoXe3s7NbX24JqULO5x519UKCenyktQ66HSjk1Pv6TFG1rcLSwrj9EXS8qL83MzSEeJ8vKzmpmayMfKGRpfjo/TpWYpyomLY6OltDPzzQxOUFAU3x6fmxwfI6KjRscKZORlWpoctTT1Lu9wpqYm42Lj/+YHnJucp6eojc0PS8rMjU0PtiFJPONGDdGz4cAAABxdFJOUwCN+hdmAgIBAwL97P38aAIDY/392/4V/v7bdLu77P78cf2R/QIDAuX9+hj8agf9HP1ybK/nthuaGv7w/AHz4Ha9/uHY/aL9/LX+2kmW/vz9ytr+/fxveP7+bPz8+P7A/v3++/6I/r79AdwWdeb93X3+CABJWgAAAAlwSFlzAAALEwAACxMBAJqcGAAAARtJREFUGNMBEAHv/gAAABAAFiAcFBkbGgMACAcAAAAFABEdehh7fRdyCwQACQAABgABdBIfIR4VCg0TfyIAJgAADnMCDHV4eXd8gCgpiSwAACongiN2foGGh4iKjTCVNDYAMYwrhYOEi5GUkpabnTugPwA1ky6Oj5CXmp6ipamwRKZAAFGjOZmYnJ+kq7i8rrRJpz4ASrNSr6qsurvGw8G+tU22QgBIsUa30NnU0svCxb3AU61QAEWyVM/W3+Da2M3Hyb9XcUMATLlb197n4+LV3MzEyk6oPQBV0VxiZejm4d3b01hHQXEzAEvOYeXpZ21jX2BaT6E3Ly0APFlkb2zqcOvkXcg6MgAAJAAAAGgAamtmaW5eVjgAJQ8Ah7RsxA/wK1MAAABXelRYdFJhdyBwcm9maWxlIHR5cGUgaXB0YwAAeJzj8gwIcVYoKMpPy8xJ5VIAAyMLLmMLEyMTS5MUAxMgRIA0w2QDI7NUIMvY1MjEzMQcxAfLgEigSi4A6hcRdPJCNZUAAAAASUVORK5CYII=';
            $counter.html('').css({ 'background-color': '#FFffff', 'background-image': `url("${errorIcon16}")`, 'background-size': '16px 16px', 'background-repeat': 'no-repeat', 'background-position': 'center' });
            this.$tl_button.addClass('has-unread-messages').fadeIn();
            return;
        }

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
                this.$tl_button.find('.topiclive-counter').text(countText).css({ 'background-color': '#007bff', 'background-image': 'none' });
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
     // Point d'entrée principal du script, initialise les composants statiques.
    initStatic() {
        this.favicon = new Favicon();
        this.son = new Audio('https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/notification_sound_tl.mp3');
        this.suivreOnglets();
        this.initScrollButton();
        this.initPartialQuoteSystem();
        this.init();
        addEventListener('instantclick:newpage', this.init.bind(this));
        addEventListener('topiclive:optionchanged', (e) => {
            const { id, actif } = e.detail;
            if (id === 'topiclive_favicon' && !actif) this.favicon.maj('');
            if (id === 'topiclive_scrollbutton' && !actif) this.$tl_button.fadeOut();
        });
        $("head").append(`<style type='text/css'>.topiclive-loading:after { content: ' ○' }.topiclive-loaded:after { content: ' ●' }</style>`);
        console.log('[TopicLive+] : activé');
    }
    // Décode les classes JvCare pour obtenir une URL.
    jvCake(classe) {
        const base16 = '0A12B34C56D78E9F';
        let lien = '';
        const s = classe.split(' ')[1];
        for (let i = 0; i < s.length; i += 2) {
            lien += String.fromCharCode(base16.indexOf(s.charAt(i)) * 16 + base16.indexOf(s.charAt(i + 1)));
        }
        return lien;
    }
// Affiche une alerte à l'utilisateur.
    alert(message) {
        try {
            modal('erreur', { message });
        } catch (err) {
            alert(message);
        }
    }
// Boucle principale de rafraîchissement.
    loop() {
        if (this.isBlocked || this.is410) return; // fin de boucle si erreur
        if (typeof this.idanalyse !== 'undefined') window.clearTimeout(this.idanalyse);
        let duree = this.ongletActif ? 5000 : 10000;
        if (this.mobile) duree = 10000;
        this.oldInstance = this.instance;
        this.idanalyse = setTimeout(this.charger.bind(this), duree);
    }
// Met à jour l'URL à rafraîchir pour toujours pointer vers la dernière page.
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
// Détecte les changements de visibilité de l'onglet.
    suivreOnglets() {
        document.addEventListener('visibilitychange', () => {
            this.ongletActif = !document.hidden;
        });
    }

    handleCloudflareBlock() {
        if (this.isBlocked) return;
        this.isBlocked = true;
        window.clearTimeout(this.idanalyse);
        this.showCloudflareBanner();
        this.favicon.setCloudflareIcon();
        this.updateCounters();
    }

// Bannière si Cloudflare
       showCloudflareBanner() {
        const bannerId = 'tl-cloudflare-banner';
        if (document.getElementById(bannerId)) return;

        const bannerCSS = `
            #${bannerId} {
                display: flex;
                align-items: center;
                justify-content: center;
                position: fixed;
                top: 25%;
                width: auto;
                background-color: rgba(22, 22, 22, 0.5);
                backdrop-filter: blur(3px);
                -webkit-backdrop-filter: blur(3px);
                color: #FFFFFF;
                text-align: center;
                padding: 15px 25px;
                font-size: 16px;
                font-weight: bold;
                z-index: 99999;
                border-radius: 8px;
                border: 1px solid #F48022;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                opacity: 0;
                visibility: hidden; /* Totalement invisible au début */
                transition: opacity 0.4s ease-out;
            }
            #${bannerId}.visible {
                opacity: 1;
                visibility: visible; /* Rendu visible pour l'animation */
            }
            #${bannerId} svg {
                width: 24px;
                height: 24px;
                margin-right: 15px;
                flex-shrink: 0;
            }
        `;
        const $style = $(`<style type='text/css'>${bannerCSS}</style>`);
        $('head').append($style);

        const cloudflareLogoSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04Z" fill="#F48022"/></svg>`;
        const bannerText = 'Cloudflare : Actualisez la page pour effectuer la vérification';
        const $banner = $(`<div id="${bannerId}">${cloudflareLogoSVG}<span>${bannerText}</span></div>`);
        $('body').prepend($banner);

        const positionBanner = () => {
            if (this.mobile || $(window).width() < 1250) {
                 $banner.css({
                    'left': '50%',
                    'transform': 'translate(-50%, -50%)'
                 });
            } else {
                const $container = $('.conteneur-messages-pagi');
                if ($container.length > 0) {
                    const bannerLeft = $container.offset().left + ($container.outerWidth() / 2) - ($banner.outerWidth() / 2);
                    $banner.css({
                        'left': bannerLeft + 'px',
                        'transform': 'translateY(-50%)'
                    });
                }
            }
        };

        positionBanner(); //
        requestAnimationFrame(() => {
            $banner.addClass('visible');
        });

        $(window).off('resize.cfbanner').on('resize.cfbanner', positionBanner);
    }

    handle410Error() {
        if (this.is410) return;
        this.is410 = true;
        window.clearTimeout(this.idanalyse);
        this.show410Banner();
        this.favicon.set410Icon();
        this.updateCounters();
    }
// Bannière si erreur 410
       show410Banner() {
        const bannerId = 'tl-410-banner';
        if (document.getElementById(bannerId)) return;

        const bannerCSS = `
            #${bannerId} {
                display: flex;
                align-items: center;
                justify-content: center;
                position: fixed;
                top: 25%;
                width: auto;
                background-color: rgba(22, 22, 22, 0.5);
                backdrop-filter: blur(3px);
                -webkit-backdrop-filter: blur(3px);
                color: #FFFFFF;
                text-align: center;
                padding: 15px 25px;
                font-size: 16px;
                font-weight: bold;
                z-index: 99999;
                border-radius: 8px;
                border: 1px solid #FFFFFF;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                opacity: 0;
                visibility: hidden; /* Totalement invisible au début */
                transition: opacity 0.4s ease-out;
            }
            #${bannerId}.visible {
                opacity: 1;
                visibility: visible; /* Rendu visible pour l'animation */
            }
            #${bannerId} .tl-410-icon {
                width: 24px;
                height: 24px;
                margin-right: 15px;
                flex-shrink: 0;
            }
        `;
        const $style = $(`<style type='text/css'>${bannerCSS}</style>`);
        $('head').append($style);

        const errorIcon24 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAMAAADXqc3KAAACeVBMVEUAAAD8+/siHib7lxv+1mk6OEUmIiv+pyNHR1b+43r+uCksKTT8ixf+3HL+64v/6YT+wS00Mjz+44MYFBz+03P+23v+zGtVVmZCQkz+w1vqiBSsWgv++sv/8JHp6Oj/niD944rX1tf+7JH+3YIwLjf+yWP+xGPGllf+u1QdGSLtkxbleRb9vFr9s0uXlpmIhopVU1n++8T+9MO2tbdoaHPBiUrGxsdAPUnkdgv+1Xp3dXn+87z+87Wnpqn8oR1oZWr97Kv8zHFXWnD/0V1XSUXqpCf98pv65JPInmJLTWL+q0P/xzvoiCTx8O/96rT+/KL+7Jnys1LDjFD97br886L724z/yEXohzX+/qr866L93ZxeYHJxbnFPUmbqm1X9tlP9qjbomijHdhTogg3Pz9H+9smurbL986z64pmDe3Tqxmj8vWXLpGP3u1v/tzirYw3g3d3CwMP65KWdnKKIiZL7zIX1035kXF/jtV3Wplqaelr2t1b6r0r2qUJrU0HXlDXajDPlfijHeSPZihoRDRTU0c7++7PDubP85Kv625T904p5eoWKgnn1zHL/xWr2xWmSeGLzq1RSTlPLkE7ntEcvMkCUZDtDOzt4VDq8eznqpTjrlzXLgzS4dCnYfiTNiRrafxe4axPm4t7++r6zqqSlnJf3ypb1woz204jyuoLrsn713H2Ui3z9ynvwzXnprXf203O2oHL1yXGql2/dvGzyr2x6cmvTqmXlu2Lzq2G9l17LoFnXsFaqflHwnE3rlUfrq0WodzOrcC63bSW3ZQ6qoJ2RjI+lmHXatnDNsG2Zg2fywmTzqVuRb1Z0XVGieUvyp0jpikFkT0HaCA+lAAAAAXRSTlMAQObYZgAAAAlwSFlzAAALEwAACxMBAJqcGAAABO5pVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDkuMS1jMDAxIDc5LjE0NjI4OTksIDIwMjMvMDYvMjUtMjA6MDE6NTUgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIiB4bWxuczpwaG90b3Nob3A9Imh0dHA6Ly9ucy5hZG9iZS5jb20vcGhvdG9zaG9wLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdEV2dD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlRXZlbnQjIiB4bXA6Q3JlYXRvclRvb2w9IkFkb2JlIFBob3Rvc2hvcCAyNS4zIChXaW5kb3dzKSIgeG1wOkNyZWF0ZURhdGU9IjIwMjUtMDktMDJUMDE6NTY6NDUrMDI6MDAiIHhtcDpNb2RpZnlEYXRlPSIyMDI1LTA5LTAyVDAzOjMzOjQxKzAyOjAwIiB4bXA6TWV0YWRhdGFEYXRlPSIyMDI1LTA5LTAyVDAzOjMzOjQxKzAyOjAwIiBkYzpmb3JtYXQ9ImltYWdlL3BuZyIgcGhvdG9zaG9wOkNvbG9yTW9kZT0iMiIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpiMjYyYmUwOC04OWExLTE1NGItOGZhYS1mOTVmNDcxNjE1ZmEiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6YjI2MmJlMDgtODlhMS0xNTRiLThmYWEtZjk1ZjQ3MTYxNWZhIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6YjI2MmJlMDgtODlhMS0xNTRiLThmYWEtZjk1ZjQ3MTYxNWZhIj4gPHhtcE1NOkhpc3Rvcnk+IDxyZGY6U2VxPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0iY3JlYXRlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpiMjYyYmUwOC04OWExLTE1NGItOGZhYS1mOTVmNDcxNjE1ZmEiIHN0RXZ0OndoZW49IjIwMjUtMDktMDJUMDE6NTY6NDUrMDI6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyNS4zIChXaW5kb3dzKSIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz6AltmBAAAB9klEQVQokV1Sz2vTcBx9n883SX8k7cziZsBOLZQyWzA6x+bJoghDmBuIDBSdlyLozjuJA0X8A7yIJw+ioggDL8p2mAdRROpFq45NqtUdxmraNbi0abN4cCviuzweDx68xwO2Md2789jFhx1Jf2nqZ3mtFwmgPjQxCAAQAID00We5HSW3sva1S7zJv+gY4+W1jVIxUm/1/dr9diKIftmKGi9kliuQIBCgliTHuDUGCKB/w61UQewqQa2RJMdo1/uLYKRzPVgn6YKrNWrdY3DQlt+nAUb74+c6eQ/mH1VdXBvZZ9sl/dOPUQhkexbhQQvsAkYGZgY+AN8TrxyHp7HgeZBi0bimLZQBwJSA1Um6eseF5AKHlgAPetUH2kAkznUXLQCnr8Dz4Ff87UmkeAtwc+G5OQD+ubOzi8V1GVB1ZuDS85OroVBjc5OWn9x7nWg2I749JS6XWn335yMrzTOxcuC/pGAl2upytRRgDsukWnI4mSTdolRqF1mqopqALBPtyasKHVBUnRQ+ZdFTi1VCCvJvNbQEvwk5ZpNud8e/ye0IoChElGeDdGI+bHCO6PxtxQQUNoYOMrNJN5mt/YqqD58AAKhsWMzMiq7K4Zm7mpY5stUxbA4WbgghhBCapmUy1/89A0Yr7wDguLP3Mf7DbDabzU525B+VgKLP+4NhawAAAABJRU5ErkJggg==';
        const bannerText = "410 : Topic censuré par la liberté d'expression";
        const errorIconHTML = `<img src="${errorIcon24}" class="tl-410-icon" alt="Erreur 410">`;
        const $banner = $(`<div id="${bannerId}">${errorIconHTML}<span>${bannerText}</span></div>`);
        $('body').prepend($banner);

        const positionBanner = () => {
            if (this.mobile || $(window).width() < 1250) {
                 $banner.css({
                    'left': '50%',
                    'transform': 'translate(-50%, -50%)'
                 });
            } else {
                const $container = $('.conteneur-messages-pagi');
                if ($container.length > 0) {
                    const bannerLeft = $container.offset().left + ($container.outerWidth() / 2) - ($banner.outerWidth() / 2);
                    $banner.css({
                        'left': bannerLeft + 'px',
                        'transform': 'translateY(-50%)'
                    });
                }
            }
        };

        positionBanner();
        requestAnimationFrame(() => {
            $banner.addClass('visible');
        });

        $(window).off('resize.410banner').on('resize.410banner', positionBanner);
    }

// Wrapper pour la requête AJAX de récupération de la page.
    GET(cb) {
        const blocChargement = this.mobile ? $('.bloc-nom-sujet:last > span') : $('#bloc-formulaire-forum .titre-bloc');
        blocChargement.addClass('topiclive-loading');
        window.clearTimeout(this.idanalyse);
        $.ajax({
            type: 'GET',
            url: this.url,
            timeout: 5000,
            success: (data, textStatus, jqXHR) => {
                const responseText = jqXHR.responseText;
                if (responseText.includes('id="cf-challenge-form"') || responseText.includes('<title>Just a moment...</title>')) {
                    TL.handleCloudflareBlock();
                    return;
                }
                if (this.oldInstance != this.instance) return;
                blocChargement.removeClass('topiclive-loading').addClass('topiclive-loaded');
                cb($(responseText.substring(responseText.indexOf('<!DOCTYPE html>'))));
                setTimeout(() => { blocChargement.removeClass('topiclive-loaded'); }, 100);
                TL.loop();
            },
            error: (jqXHR) => {
                if (jqXHR.status === 403 && jqXHR.responseText.includes('Cloudflare')) {
                    TL.handleCloudflareBlock();
                    return;
                }
                if (jqXHR.status === 410) {
                    TL.handle410Error();
                    return;
                }
                TL.loop();
            }
        });
    }
}

// Lancement du script
var TL = new TopicLive();
TL.initStatic();
