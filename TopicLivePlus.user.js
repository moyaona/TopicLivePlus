// ==UserScript==
// @name          TopicLive+
// @namespace     TopicLive+JVC
// @description   Charge les nouveaux messages d'un topic JVC en direct.
// @author        moyaona, lantea/atlantis, kiwec
// @match         https://www.jeuxvideo.com/forums/*
// @downloadURL   https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/TopicLivePlus.user.js
// @updateURL     https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/TopicLivePlus.user.js
// @run-at        document-end
// @require       https://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js
// @icon          https://image.noelshack.com/fichiers/2025/35/4/1756403430-image.png
// @version       8.0
// @grant         GM_xmlhttpRequest
// @connect       raw.githubusercontent.com
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
        if (TL.options.sound) {
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

        const connectesText = this.trouver('.nb-connect-fofo').text().trim();
        if (connectesText && TL.$tl_connected_counter) {
            TL.$tl_connected_counter.text(connectesText.split(' ')[0]);
        }
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
                    nvMsg.initPartialQuote();
                    nvMsg.fixDeroulerCitation();
                    nvMsg.fixImages();
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

                    if (TL.justPostedMessageId) {
                        const messageSelector = `${TL.class_msg}[data-id="${TL.justPostedMessageId}"], #message_${TL.justPostedMessageId}`;
                        const $myNewMessage = $(messageSelector);

                        if ($myNewMessage.length > 0) {
                            TL.isChatModeActive = true;
                            const targetScrollTop = $myNewMessage.offset().top - 100;
                            $('html, body').stop().animate({
                                scrollTop: targetScrollTop
                            }, 800);
                            TL.updateCounters();
                        }
                        TL.justPostedMessageId = null;
                    } else if (TL.isChatModeActive && !isTextareaFocused) {
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
 * Représente un message unique du forum et ses propriétés.
 */
class Message {
    constructor($message) {
        if (TL.estMP) {
            this.id_message = 'MP';
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
                    const datePropre = this.date.trim().replace(/\s+/g, ' ');
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

                    setTimeout(() => {
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

            const top = rect.bottom + window.scrollY + 10;
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
        textarea.dispatchEvent(new Event('input', {
            bubbles: true
        }));

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        TL.$partialQuoteButton.removeClass('active');
    }

    /**
     * Permet de déplier les citations imbriquées.
     */
    fixDeroulerCitation() {
        this.trouver('.text-enrichi-forum > blockquote.blockquote-jv > blockquote').each(function() {
            const $quote = $(this);
            const $buttonOpenQuote = $('<div class="nested-quote-toggle-box"></div>');
            $quote.prepend($buttonOpenQuote);
            $buttonOpenQuote.on('click', function() {
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
            const extension = $img.attr('alt').split('.').pop();
            if (src && src.includes('/minis/')) {
                const direct = src.replace(/\/minis\/(.*)\.\w+$/, `/fichiers/$1.${extension}`);
                $img.attr('src', direct);
                $img.css('object-fit', 'contain');
            }
        });
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
        this.trouver(TL.class_contenu).html(nvMessage.trouver(TL.class_contenu).html());
        TL.page.Transformation();
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
        this.formSessionData = null;
        this.observerLeBouton('.postMessage');
    }
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
    hook() {
        const $boutonEnvoi = $('.postMessage');
        if ($boutonEnvoi.length > 0) {
            $boutonEnvoi.off('click.topiclive').on('click.topiclive', (e) => this.envoyer(e));
        }
    }
    _getForumPayload() {
        try {
            return JSON.parse(atob(unsafeWindow.jvc.forumsAppPayload));
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
    _setTextAreaValue(textarea, value) {
        const prototype = Object.getPrototypeOf(textarea);
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        nativeSetter.call(textarea, value);
        textarea.dispatchEvent(new Event('input', {
            bubbles: true
        }));
    }
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

        const handleSuccess = (response) => {
            const isOnLastPage = $('.pagi-suivant-inactif').length > 0;
            self._setTextAreaValue($msgTextarea[0], '');

            if (isOnLastPage) {
                if (response.redirectUrl) {
                    try {
                        const url = new URL(response.redirectUrl, window.location.origin);
                        const hash = url.hash;
                        if (hash && hash.startsWith('#post_')) {
                            TL.justPostedMessageId = hash.replace('#post_', '');
                        }
                    } catch (err) {
                        console.error("[TopicLive+] Erreur d'analyse de l'URL de redirection.", err);
                    }
                }
                setTimeout(() => TL.charger(), 500);
            } else {
                if (response.redirectUrl) {
                    localStorage.setItem('tl_force_live_mode', 'true');
                    window.location.href = response.redirectUrl;
                } else {
                    const $bouton = $(TL.class_page_fin);
                    let lastPageUrl = '';
                    if ($bouton.length > 0) {
                        if ($bouton.prop('tagName') == 'A') {
                            lastPageUrl = $bouton.attr('href');
                        } else {
                            lastPageUrl = TL.jvCake($bouton.attr('class'));
                        }
                    }
                    if (lastPageUrl) {
                        localStorage.setItem('tl_force_live_mode', 'true');
                        window.location.href = lastPageUrl;
                    } else {
                        location.reload();
                    }
                }
            }
        };

        $.ajax({
            type: 'POST',
            url: 'https://www.jeuxvideo.com/forums/message/add',
            data: dataObject,
            dataType: 'json',
            success: (response) => {
                if (response.formSession) {
                    self.formSessionData = response.formSession;
                }
                const hasSessionError = response.errors && response.errors.session;
                if (hasSessionError) {
                    let retryDataObject = { ...self.formSessionData,
                        text: message,
                        topicId: self._getTopicId(),
                        forumId: self._getForumId(),
                        group: "1",
                        messageId: "undefined",
                        ajax_hash: $('#ajax_hash_liste_messages').val()
                    };
                    $.ajax({
                        type: 'POST',
                        url: 'https://www.jeuxvideo.com/forums/message/add',
                        data: retryDataObject,
                        dataType: 'json',
                        success: (finalResponse) => {
                            if (finalResponse.errors && Object.keys(finalResponse.errors).length > 0) {
                                self.afficherErreurs(Object.values(finalResponse.errors).join('\n'));
                            } else {
                                handleSuccess(finalResponse);
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
                    handleSuccess(response);
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
    obtenirMessage($form) {
        if (typeof $form == 'undefined') $form = this.obtenirFormulaire();
        return $form.find('#message_topic');
    }
    obtenirFormulaire($page) {
        if (typeof $page === 'undefined') $page = $(document);
        return $page.find('#forums-post-message-editor');
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
 * C'est le point d'entrée qui initialise tous les composants.
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
        this.$tl_forum_button = null;
        this.justPostedMessageId = null;
        this.forumButtonState = false;
        this.$tl_quick_reply_button = null;
        this.$tl_settings_button = null;
        this.$tl_settings_modal = null;
        this.$tl_settings_overlay = null;
        this.options = {};
        this.tempOptions = {};
        this.isForumPage = false;
        this.$tl_connected_counter = null;
        this.changelogContent = null;
    }

    /**
     * Charge les paramètres de l'utilisateur depuis le localStorage.
     * Chaque paramètre a une valeur par défaut s'il n'est pas trouvé.
     */
    loadSettings() {
        const load = (key, defaultValue) => {
            const value = localStorage.getItem(key);
            return value === null ? defaultValue : (value === 'true');
        };

        this.options.sound = load('topiclive_sound', false);
        this.options.favicon = load('topiclive_favicon', true);
        this.options.newMessagesButton = load('topiclive_newMessagesButton', true);
        this.options.showCounterOnButton = load('topiclive_showCounterOnButton', true);
        this.options.listButton = load('topiclive_listButton', true);
        this.options.listButtonSwipe = load('topiclive_listButtonSwipe', true);
        this.options.quickReplyButton = load('topiclive_quickReplyButton', true);
        this.options.counterOnTopics = load('topiclive_counterOnTopics', true);
        this.options.counterOnForums = load('topiclive_counterOnForums', true);
    }

    /**
     * Lance une requête pour récupérer la dernière version de la page du topic.
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
     * Point d'entrée principal du script, appelé au chargement de la page.
     * Il détermine le type de page (forum, topic) et lance les fonctionnalités appropriées.
     */
    init() {
        const estPageDeForum = document.URL.match(/\/forums\/(?:0|42|1)-/);
        if (!estPageDeForum) {
            if (this.$tl_button) this.$tl_button.hide();
            if (this.$tl_forum_button) this.$tl_forum_button.hide();
            if (this.$tl_quick_reply_button) this.$tl_quick_reply_button.hide();
            if (this.$tl_connected_counter) this.$tl_connected_counter.hide();
            return;
        }

        if (typeof $ === 'undefined') {
            return;
        }

        this.loadSettings();

        const forceLive = localStorage.getItem('tl_force_live_mode') === 'true';
        if (forceLive) {
            localStorage.removeItem('tl_force_live_mode');
        }
        const shouldGoLive = window.location.hash === '#tl-go-live' || window.location.hash.startsWith('#post_') || forceLive;

        if (this.$tl_button) this.$tl_button.hide();
        if (this.$tl_forum_button) this.$tl_forum_button.hide();
        if (this.$tl_quick_reply_button) this.$tl_quick_reply_button.hide();
        if (this.$tl_connected_counter) this.$tl_connected_counter.hide();
        this.isChatModeActive = false;
        this.nvxMessages = 0;
        this.unreadMessageAnchors = [];
        this.lastScrollTop = 0;

        if (document.URL.match(/\/forums\/0-/)) {
            this.isForumPage = true;
            this.instance++;
            this.url = document.URL;
            if (this.options.counterOnForums) {
                this.$tl_connected_counter.show();
            }
            this.updateDesktopButtonPosition();
            this.scanForumPageAndUpdate($(document));
            this.loopForum();
            return;
        }

        const analysable = document.URL.match(/\/forums\/(?:42|1)-/);
        if (!analysable) {
            return;
        }
        this.isForumPage = false;
        this.instance++;
        this.ajaxTs = $('#ajax_timestamp_liste_messages').val();
        this.ajaxHash = $('#ajax_hash_liste_messages').val();
        this.estMP = false;
        this.url = document.URL;
        this.class_msg = '.bloc-message-forum';
        this.class_num_page = '.page-active';
        this.class_page_fin = '.pagi-fin-actif';
        this.class_date = '.bloc-date-msg';
        this.class_contenu = '.bloc-contenu';
        this.class_pagination = '.bloc-pagi-default';

        if ($(this.class_msg).length > 0) {
            this.page = new Page($(document));
            this.formu = new Formulaire();
            this.messages = this.page.obtenirMessages();

            this.applySettings(); // Applique les paramètres pour afficher les bons boutons
            this.updateDesktopButtonPosition();
            this.updateCounters();

            if (shouldGoLive) {
                this.isChatModeActive = true;
                if (window.location.hash.startsWith('#post_')) {
                    setTimeout(() => {
                        const $targetMessage = $(window.location.hash);
                        if ($targetMessage.length > 0) {
                            const targetScrollTop = $targetMessage.offset().top - 100;
                            $('html, body').stop().animate({
                                scrollTop: targetScrollTop
                            }, 800);
                        }
                    }, 200);
                } else if (window.location.hash === '#tl-go-live') {
                    setTimeout(() => {
                        const $lastMessage = $(`${TL.class_msg}:last`);
                        if ($lastMessage.length > 0) {
                            const targetScrollTop = $lastMessage.offset().top - 100;
                            $('html, body').animate({
                                scrollTop: targetScrollTop
                            }, 800);
                        }
                        history.replaceState(null, document.title, window.location.pathname + window.location.search);
                    }, 100);
                }
            }

            this.page.scan();
            this.loop();
        }
    }

    /**
     * Crée et attache le bouton flottant principal pour les nouveaux messages.
     */
    initScrollButton() {
        const arrowIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
        const buttonCss = `
            .topiclive-floating-button {
                z-index: 1000; font-weight: bold; color: white; background-color: rgba(22, 22, 22, 0.3);
                border: 1px solid rgba(74, 74, 74, 1); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); cursor: pointer; display: flex; align-items: center;
                height: 35px; width: 35px; border-radius: 50%; padding: 0; justify-content: center; transform: translateZ(0);
                transition: width 0.3s ease, padding 0.3s ease, border-radius 0.3s ease, background-color 0.2s ease, transform 0.2s ease;
            }
            .topiclive-floating-button:hover { background-color: rgba(40, 40, 40, 0.9); transform: translateY(-2px); }
            .topiclive-floating-button:active { transform: translateY(1px); }
            #topiclive-button.has-unread-messages { width: auto; padding: 0 10px 0 8px; border-radius: 50px; }
            #topiclive-button .topiclive-counter {
                font-size: 13px; background-color: #007bff; border-radius: 50%; width: 24px; height: 24px;
                line-height: 24px; text-align: center; margin-right: 8px; transform: scale(0);
                transition: transform 0.2s 0.1s ease, opacity 0.2s 0.1s ease, width 0.3s ease;
                opacity: 0; width: 0; overflow: hidden; display: none;
            }
            #topiclive-button.has-unread-messages .topiclive-counter { display: block; transform: scale(1); opacity: 1; width: 24px; }
            #topiclive-button .topiclive-arrow { transition: transform 0.3s ease; display: flex; align-items: center; }
            .button-transitioning {
                transform: scale(0.9);
                transition: transform 0.15s ease, background-color 0.15s ease;
            }
            #topiclive-connected-counter {
                pointer-events: none;
            }
            .tl-counter-button {
                width: 20px;
                height: 20px;
                line-height: 20px;
                font-size: 11px;
                font-weight: bold;
            }
        `;
        $('head').append(`<style>${buttonCss}</style>`);
        this.$tl_button = $(`<button id="topiclive-button" class="topiclive-floating-button"><span class="topiclive-counter"></span><span class="topiclive-arrow">${arrowIconSvg}</span></button>`).hide();
        this.$tl_button.get(0).TL = this;
        $('body').append(this.$tl_button);

        this.$tl_button.on('click', () => {
            const isOnLastPage = $('.pagi-suivant-inactif').length > 0;
            if (isOnLastPage) {
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
            } else {
                const $bouton = $(this.class_page_fin);
                let lastPageUrl = '';
                if ($bouton.length > 0) {
                    if ($bouton.prop('tagName') == 'A') {
                        lastPageUrl = $bouton.attr('href');
                    } else {
                        lastPageUrl = this.jvCake($bouton.attr('class'));
                    }
                }
                if (lastPageUrl) {
                    window.location.href = lastPageUrl + '#tl-go-live';
                }
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

    initForumListButton() {
        const listIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="17.2" height="17.2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;

        this.$tl_forum_button = $(`<button id="topiclive-forumlist-button" class="topiclive-floating-button">${listIconSvg}</button>`).hide();
        $('body').append(this.$tl_forum_button);

        let startX = 0;
        let startY = 0;
        let isDragging = false;
        const swipeThreshold = 30;

        this.$tl_forum_button.on('mousedown touchstart', (e) => {
            if (!this.options.listButtonSwipe) return;
            isDragging = false;
            const touch = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
        });

        this.$tl_forum_button.on('mousemove touchmove', (e) => {
            if (!this.options.listButtonSwipe) return;
            if (startX === 0 && startY === 0) return;
            const touch = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
            const diffX = Math.abs(touch.clientX - startX);
            const diffY = Math.abs(touch.clientY - startY);
            if (diffX > swipeThreshold && diffX > diffY) {
                isDragging = true;
            }
        });

        this.$tl_forum_button.on('mouseup touchend', (e) => {
            if (!this.options.listButtonSwipe) return;
            if (isDragging) {
                e.preventDefault();
                e.stopPropagation();
                this.toggleForumButtonState();
            }
            startX = 0;
            startY = 0;
        });

        this.$tl_forum_button.on('click', (e) => {
            if (isDragging) {
                isDragging = false;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (this.forumButtonState && this.options.listButtonSwipe) {
                this.scrollToReplyForm();
            } else {
                this.goToForumList();
            }
        });
    }

    initQuickReplyButton() {
        const replyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="17.5" height="17.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
        this.$tl_quick_reply_button = $(`<button id="topiclive-quickreply-button" class="topiclive-floating-button">${replyIconSvg}</button>`).hide();
        $('body').append(this.$tl_quick_reply_button);
        this.$tl_quick_reply_button.on('click', () => {
            this.scrollToReplyForm();
        });
    }

    /**
     * Construit le HTML et le CSS du menu des paramètres, et l'injecte dans la page.
     * Cette fonction est conçue pour n'être exécutée qu'une seule fois.
     */
    initSettingsMenu() {
        if ($('#tl-settings-modal').length > 0) {
            return;
        }

        const soundOnIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/><path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.482 5.482 0 0 1 11.025 8a5.482 5.482 0 0 1-1.61 3.89l.706.706z"/><path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z"/></svg>`;
        const faviconIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M4.5 2A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 11.5 2h-7zM10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/></svg>`;
        const replyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
        const listIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
        const arrowIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
        const githubIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

        const menuHtml = `
            <div id="tl-settings-overlay" style="display: none;"></div>
            <div id="tl-settings-modal" style="display: none;">
                <div class="tl-smartphone-frame">
                    <div class="tl-smartphone-screen">

                        <div class="tl-smartphone-header">
                            <span class="tl-header-title">TopicLive+</span>
                            <div class="tl-dark-mode-container">
                                <span class="tl-dark-mode-label">Menu Sombre</span>
                                <div class="tl-dark-mode-toggle">
                                    <input type="checkbox" class="input-on-off" id="tl-setting-dark-mode">
                                    <label for="tl-setting-dark-mode" class="btn-on-off"></label>
                                </div>
                            </div>
                        </div>

                        <ul class="tl-settings-list">
                            <li class="tl-setting-separator">Onglet</li>
                            <li><div class="tl-setting-label"><span class="tl-setting-icon">${soundOnIcon}</span><span>Son des notifications</span></div><div class="tl-setting-toggle"><input type="checkbox" class="input-on-off" id="tl-setting-sound"><label for="tl-setting-sound" class="btn-on-off"></label></div></li>
                            <li><div class="tl-setting-label"><span class="tl-setting-icon">${faviconIcon}</span><span>Compteur sur Favicon</span></div><div class="tl-setting-toggle"><input type="checkbox" class="input-on-off" id="tl-setting-favicon"><label for="tl-setting-favicon" class="btn-on-off"></label></div></li>

                            <li class="tl-setting-separator">Affichage des boutons</li>
                            <li><div class="tl-setting-label"><div id="tl-sim-quick-reply" class="topiclive-floating-button">${replyIconSvg}</div><span>Réponse rapide</span></div><div class="tl-setting-toggle"><input type="checkbox" class="input-on-off" id="tl-setting-quick-reply"><label for="tl-setting-quick-reply" class="btn-on-off"></label></div></li>
                            <li><div class="tl-setting-label"><div id="tl-sim-list" class="topiclive-floating-button">${listIconSvg}</div><span>Liste des sujets</span></div><div class="tl-setting-toggle"><input type="checkbox" class="input-on-off" id="tl-setting-list"><label for="tl-setting-list" class="btn-on-off"></label></div></li>
                            <li id="tl-li-list-swipe">
                                <div class="tl-setting-label">
                                    <div class="tl-swipe-visual">
                                        <div class="topiclive-floating-button">${listIconSvg}</div>
                                        <span class="tl-swipe-arrow">→</span>
                                        <div class="topiclive-floating-button" style="background-color: rgba(0, 123, 255, 0.3);">${replyIconSvg}</div>
                                    </div>
                                    <span>Activer le Swipe</span>
                                </div>
                                <div class="tl-setting-toggle">
                                    <input type="checkbox" class="input-on-off" id="tl-setting-list-swipe"><label for="tl-setting-list-swipe" class="btn-on-off"></label>
                                </div>
                            </li>
                            <li><div class="tl-setting-label"><div id="tl-sim-new-messages" class="topiclive-floating-button"><span class="topiclive-arrow">${arrowIconSvg}</span></div><span>Accéder au direct</span></div><div class="tl-setting-toggle"><input type="checkbox" class="input-on-off" id="tl-setting-new-messages"><label for="tl-setting-new-messages" class="btn-on-off"></label></div></li>
                            <li><div class="tl-setting-label"><div id="tl-sim-new-messages-counter" class="topiclive-floating-button"><span class="topiclive-counter">1</span><span class="topiclive-arrow">${arrowIconSvg}</span></div><span>Nouveau message</span></div><div class="tl-setting-toggle"><input type="checkbox" class="input-on-off" id="tl-setting-show-counter"><label for="tl-setting-show-counter" class="btn-on-off"></label></div></li>

                            <li class="tl-setting-separator">Compteur de connectés</li>
                            <li><div class="tl-setting-label"><div id="tl-sim-counter-topics" class="topiclive-floating-button tl-counter-button">14</div><span>Sur les topics</span></div><div class="tl-setting-toggle"><input type="checkbox" class="input-on-off" id="tl-setting-counter-topics"><label for="tl-setting-counter-topics" class="btn-on-off"></label></div></li>
                            <li><div class="tl-setting-label"><div id="tl-sim-counter-forums" class="topiclive-floating-button tl-counter-button">564</div><span>Sur les forums</span></div><div class="tl-setting-toggle"><input type="checkbox" class="input-on-off" id="tl-setting-counter-forums"><label for="tl-setting-counter-forums" class="btn-on-off"></label></div></li>
                        </ul>

                        <div class="tl-settings-actions">
                            <button id="tl-settings-cancel" class="btn">Annuler</button>
                            <button id="tl-settings-save" class="btn btn-poster-msg">Sauvegarder</button>
                        </div>

                        <div class="tl-settings-footer">
                            <span id="tl-show-changelog" class="tl-footer-link">Voir le changelog</span>
                            <a href="https://github.com/moyaona/TopicLivePlus" target="_blank" class="tl-footer-link">
                                ${githubIconSvg}
                                <span>GitHub</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            <div id="tl-changelog-overlay" style="display: none;"></div>
            <div id="tl-changelog-modal" style="display: none;">
                <h2>Changelog TopicLive+</h2>
                <pre id="tl-changelog-content">Chargement...</pre>
                <button id="tl-changelog-close" class="btn">Fermer</button>
            </div>`;

        const menuCss = `
            :root {
                --tl-bg-light: #f5f5f5;
                --tl-text-light: #333;
                --tl-border-light: #e0e0e0;
                --tl-header-bg-light: #f5f5f5;
                --tl-header-text-light: #111;
                --tl-separator-bg-light: #e0e0e0;

                --tl-bg-dark: #2d2d2d;
                --tl-text-dark: #f0f0f0;
                --tl-border-dark: #444;
                --tl-header-bg-dark: #1e1e1e;
                --tl-header-text-dark: #f0f0f0;
                --tl-separator-bg-dark: #444;
            }

            .tl-settings-button {
                color: white !important;
                background: linear-gradient(90deg, rgba(0, 82, 204, 0.5), rgba(244, 128, 34, 0.5)) !important;
                border: 1px solid #F48022 !important;
                transition: all 0.2s ease-in-out !important;
                font-weight: bold !important;
                padding: 4px 10px !important;
                font-size: 13px !important;
                line-height: 1.5 !important;
            }
            .tl-settings-button:hover {
                transform: scale(1.03);
                filter: brightness(115%);
            }
            #tl-settings-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); z-index: 9998;
            }
            #tl-settings-modal {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                z-index: 9999; display: flex; align-items: center; justify-content: center;
                padding: 10px; box-sizing: border-box;
            }
            .tl-smartphone-frame {
                width: 100%; max-width: 340px;
                max-height: 70vh;
                background: #111;
                border: 2px solid #000;
                border-radius: 20px;
                padding: 5px;
                box-shadow: 0 5px 25px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
            }
            .tl-smartphone-screen {
                background: var(--tl-bg-light);
                height: 100%;
                border-radius: 15px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .tl-smartphone-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 15px;
                border-bottom: 1px solid var(--tl-border-light);
                background-color: var(--tl-header-bg-light);
                color: var(--tl-header-text-light);
                flex-shrink: 0;
            }
            .tl-header-title {
                font-size: 21px;
                font-weight: 900;
                background: linear-gradient(90deg, rgba(0, 82, 204, 0.9), rgba(244, 128, 34, 0.9));
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                filter: drop-shadow(0px 0px 1px rgba(0,0,0,0.2));
            }
            .tl-dark-mode-container {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .tl-dark-mode-label {
                font-size: 10px;
                font-weight: normal;
            }
            .tl-settings-list {
                list-style: none; padding: 15px 5px; margin: 0;
                color: var(--tl-text-light);
                overflow-y: auto;
                flex-grow: 1;
            }
            .tl-settings-list li {
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 15px;
                border-bottom: 1px solid var(--tl-border-light);
            }
            .tl-settings-list li:last-child { border-bottom: none; }
            .tl-setting-label { display: flex; align-items: center; gap: 15px; font-size: 14px; }
            .tl-setting-icon { color: #555; }
            .tl-setting-separator {
                display: block; width: 100%;
                background: var(--tl-separator-bg-light);
                padding: 2px 15px; font-weight: bold; font-size: 12px; margin-top: 10px;
            }
            #tl-li-list-swipe { background: #f0f0f0; }
            .tl-swipe-visual { display: flex; align-items: center; gap: 5px; }
            .tl-swipe-visual .topiclive-floating-button { width: 28px; height: 28px; transform: none !important; cursor: default; box-shadow: none; border-width: 1px; }
            .tl-swipe-visual .topiclive-floating-button svg { width: 16px; height: 16px; }
            .tl-swipe-arrow { font-size: 20px; font-weight: bold; color: #555; }
            .tl-sim-disabled { opacity: 0.4; filter: grayscale(80%); }
            .topiclive-floating-button .topiclive-arrow { font-size: 20px; line-height: 1; }
            .tl-settings-actions {
                padding: 15px; border-top: 1px solid var(--tl-border-light);
                display: flex; justify-content: space-between; gap: 10px;
                flex-shrink: 0;
            }
            .tl-settings-actions .btn { flex-grow: 1; transition: transform 0.1s ease, filter 0.2s ease, background-color 0.2s ease; }
            .tl-settings-actions .btn:hover { filter: brightness(90%); }
            .tl-settings-actions .btn:active { transform: translateY(1px); filter: brightness(80%); }
            #tl-settings-cancel { background-color: #6c757d; color: white !important; border: none; }
            #tl-settings-cancel:hover { background-color: #5a6268; filter: brightness(100%); }

            #tl-sim-new-messages-counter { width: auto; padding: 0 10px 0 8px; border-radius: 50px; }
            #tl-sim-new-messages-counter .topiclive-counter { font-size: 13px; background-color: #007bff; border-radius: 50%; width: 24px; height: 24px; line-height: 24px; text-align: center; margin-right: 8px; display: inline-block; }
            #tl-sim-new-messages-counter .topiclive-arrow { display: inline-flex; align-items: center; }

            #tl-save-toast {
                position: fixed; top: 100px; left: 50%;
                transform: translate(-50%, -150%);
                background-color: rgba(40, 167, 69, 0.5);
                border: 1px solid #28a745;
                backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
                color: white; padding: 10px 20px; border-radius: 8px;
                z-index: 10000; font-size: 14px; font-weight: bold;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                opacity: 0; visibility: hidden;
                transition: transform 0.4s ease, opacity 0.4s ease, visibility 0.4s;
                text-align: center;
            }
            #tl-save-toast.show { transform: translate(-50%, 0); opacity: 1; visibility: visible; }

            /* Dark Mode Styles */
            #tl-settings-modal.tl-dark-mode .tl-smartphone-screen { background: var(--tl-bg-dark); }
            #tl-settings-modal.tl-dark-mode .tl-smartphone-header { background: var(--tl-header-bg-dark); color: var(--tl-header-text-dark); border-bottom-color: var(--tl-border-dark); }
            #tl-settings-modal.tl-dark-mode .tl-settings-list { color: var(--tl-text-dark); }
            #tl-settings-modal.tl-dark-mode .tl-settings-list li { border-bottom-color: var(--tl-border-dark); }
            #tl-settings-modal.tl-dark-mode .tl-setting-separator { background: var(--tl-separator-bg-dark); color: #ccc; }
            #tl-settings-modal.tl-dark-mode .tl-setting-icon { color: #ccc; }
            #tl-settings-modal.tl-dark-mode .tl-settings-actions { border-top-color: var(--tl-border-dark); }
            #tl-settings-modal.tl-dark-mode .tl-footer-link { color: #58a6ff; }
            #tl-settings-modal.tl-dark-mode .tl-settings-footer { border-top-color: var(--tl-border-dark); }
            #tl-settings-modal.tl-dark-mode #tl-li-list-swipe { background: #333; }
            #tl-settings-modal.tl-dark-mode .tl-swipe-arrow { color: #ccc; }


            .tl-settings-footer { padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--tl-border-light); flex-shrink: 0; }
            .tl-footer-link { color: #007bff; cursor: pointer; font-size: 13px; text-decoration: none; display: flex; align-items: center; gap: 5px; }
            .tl-footer-link:hover { text-decoration: underline; }
            #tl-changelog-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; }
            #tl-changelog-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 600px; max-height: 80vh; background: #2d2d2d; color: #f0f0f0; border: 1px solid #555; border-radius: 12px; box-shadow: 0 5px 25px rgba(0,0,0,0.5); z-index: 10001; display: flex; flex-direction: column; padding: 20px; }
            #tl-changelog-modal h2 { margin-top: 0; color: #fff; border-bottom: 1px solid #555; padding-bottom: 10px; }
            #tl-changelog-content { flex-grow: 1; overflow-y: auto; white-space: pre-wrap; font-family: monospace; background: #1e1e1e; padding: 15px; border-radius: 6px; }
            #tl-changelog-close { margin-top: 20px; background-color: #6c757d; color: white; border: none; align-self: flex-end; transition: background-color 0.2s ease; }
            #tl-changelog-close:hover { background-color: #5a6268; }
            `;

        $('head').append(`<style>${menuCss}</style>`);
        $('body').append(menuHtml);
        $('body').append('<div id="tl-save-toast">Paramètres sauvegardés</div>');

        this.$tl_settings_modal = $('#tl-settings-modal');
        this.$tl_settings_overlay = $('#tl-settings-overlay');

        const closeModal = () => {
            this.$tl_settings_modal.hide();
            this.$tl_settings_overlay.hide();
        };

        this.$tl_settings_modal.on('click', closeModal);
        this.$tl_settings_modal.find('.tl-smartphone-frame').on('click', function(e) {
            e.stopPropagation();
        });

        $('#tl-settings-cancel').on('click', closeModal);
        $('#tl-settings-save').on('click', () => {
            this.saveSettings();
            closeModal();
            const $toast = $('#tl-save-toast');
            $toast.addClass('show');
            setTimeout(() => {
                $toast.removeClass('show');
            }, 2500);
        });

        $('#tl-setting-dark-mode').on('change', (e) => {
            const isDarkMode = $(e.target).is(':checked');
            this.$tl_settings_modal.toggleClass('tl-dark-mode', isDarkMode);
            localStorage.setItem('topiclive_dark_mode', isDarkMode);
        });


        this.attachSettingsListeners();

        const $changelogModal = $('#tl-changelog-modal');
        const $changelogOverlay = $('#tl-changelog-overlay');
        const closeChangelog = () => {
            $changelogModal.hide();
            $changelogOverlay.hide();
        };

        $('#tl-show-changelog').on('click', () => this.fetchAndShowChangelog());
        $('#tl-changelog-close').on('click', closeChangelog);
        $changelogOverlay.on('click', closeChangelog);

        const observer = new MutationObserver(() => {
            const targetContainers = document.querySelectorAll('.bloc-pre-pagi-forum .bloc-pre-right');
            targetContainers.forEach(container => {
                if (container && container.querySelector('.tl-settings-button') === null) {
                    const button = document.createElement('button');
                    button.className = 'btn tl-settings-button';
                    button.title = 'Paramètres TopicLive+';
                    button.textContent = 'TopicLive+';
                    container.prepend(button);
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        $(document).on('click', '.tl-settings-button', () => {
            this.populateSettings();
            this.$tl_settings_modal.show();
            this.$tl_settings_overlay.show();
        });
    }

    /**
     * Remplit le menu des paramètres avec les valeurs actuellement sauvegardées.
     */
    populateSettings() {
        this.loadSettings();
        this.tempOptions = { ...this.options
        };

        $('#tl-setting-sound').prop('checked', this.tempOptions.sound);
        $('#tl-setting-favicon').prop('checked', this.tempOptions.favicon);
        $('#tl-setting-new-messages').prop('checked', this.tempOptions.newMessagesButton);
        $('#tl-setting-show-counter').prop('checked', this.tempOptions.showCounterOnButton);
        $('#tl-setting-quick-reply').prop('checked', this.tempOptions.quickReplyButton);
        $('#tl-setting-list').prop('checked', this.tempOptions.listButton);
        $('#tl-setting-list-swipe').prop('checked', this.tempOptions.listButtonSwipe);
        $('#tl-setting-counter-topics').prop('checked', this.tempOptions.counterOnTopics);
        $('#tl-setting-counter-forums').prop('checked', this.tempOptions.counterOnForums);

        const isDarkMode = localStorage.getItem('topiclive_dark_mode') === 'true';
        $('#tl-setting-dark-mode').prop('checked', isDarkMode);
        this.$tl_settings_modal.toggleClass('tl-dark-mode', isDarkMode);


        this.updateSimulatedButtons();
    }

    /**
     * Met à jour l'apparence des boutons de simulation dans le menu en fonction des options choisies.
     */
    updateSimulatedButtons() {
        $('#tl-sim-new-messages').toggleClass('tl-sim-disabled', !this.tempOptions.newMessagesButton);
        $('#tl-sim-new-messages-counter').toggleClass('tl-sim-disabled', !this.tempOptions.showCounterOnButton);
        $('#tl-sim-quick-reply').toggleClass('tl-sim-disabled', !this.tempOptions.quickReplyButton);
        $('#tl-sim-list').toggleClass('tl-sim-disabled', !this.tempOptions.listButton);
        $('#tl-li-list-swipe').toggle(this.tempOptions.listButton);
        $('#tl-sim-counter-topics').toggleClass('tl-sim-disabled', !this.tempOptions.counterOnTopics);
        $('#tl-sim-counter-forums').toggleClass('tl-sim-disabled', !this.tempOptions.counterOnForums);
    }

    /**
     * Attache les écouteurs d'événements aux cases à cocher du menu.
     */
    attachSettingsListeners() {
        $('#tl-setting-sound').off('change').on('change', (e) => {
            this.tempOptions.sound = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
        $('#tl-setting-favicon').off('change').on('change', (e) => {
            this.tempOptions.favicon = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
        $('#tl-setting-new-messages').off('change').on('change', (e) => {
            this.tempOptions.newMessagesButton = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
        $('#tl-setting-show-counter').off('change').on('change', (e) => {
            this.tempOptions.showCounterOnButton = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
        $('#tl-setting-quick-reply').off('change').on('change', (e) => {
            this.tempOptions.quickReplyButton = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
        $('#tl-setting-list').off('change').on('change', (e) => {
            this.tempOptions.listButton = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
        $('#tl-setting-list-swipe').off('change').on('change', (e) => {
            this.tempOptions.listButtonSwipe = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
        $('#tl-setting-counter-topics').off('change').on('change', (e) => {
            this.tempOptions.counterOnTopics = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
        $('#tl-setting-counter-forums').off('change').on('change', (e) => {
            this.tempOptions.counterOnForums = $(e.target).is(':checked');
            this.updateSimulatedButtons();
        });
    }

    /**
     * Sauvegarde les options temporaires dans le localStorage et les applique.
     */
    saveSettings() {
        this.options = { ...this.tempOptions
        };
        Object.keys(this.options).forEach(key => {
            localStorage.setItem(`topiclive_${key}`, this.options[key]);
        });
        this.applySettings();
    }

    /**
     * Applique les paramètres sauvegardés à l'interface (affiche/cache les boutons).
     */
    applySettings() {
        if (!this.options.favicon) {
            this.favicon.maj('');
        }
        this.updateCounters();

        this.$tl_quick_reply_button.toggle(this.options.quickReplyButton && !this.isForumPage);
        this.$tl_forum_button.toggle(this.options.listButton && !this.isForumPage);

        if (this.isForumPage) {
            this.$tl_connected_counter.toggle(this.options.counterOnForums);
        } else {
            this.$tl_connected_counter.toggle(this.options.counterOnTopics);
        }
    }

    /**
     * Tente de récupérer le changelog depuis le lien brut de GitHub.
     * En cas d'échec, affiche un lien direct pour une consultation manuelle.
     */
    fetchAndShowChangelog() {
        const changelogUrl = 'https://raw.githubusercontent.com/moyaona/TopicLivePlus/main/Changelog.md';
        const fallbackUrl = 'https://github.com/moyaona/TopicLivePlus/blob/main/Changelog.md';

        const $modal = $('#tl-changelog-modal');
        const $overlay = $('#tl-changelog-overlay');
        const $content = $('#tl-changelog-content');

        $overlay.show();
        $modal.show();

        if (this.changelogContent) {
            $content.text(this.changelogContent);
            return;
        }

        $content.text('Chargement en cours...');

        GM_xmlhttpRequest({
            method: "GET",
            url: changelogUrl,
            onload: (response) => {
                this.changelogContent = response.responseText;
                $content.text(this.changelogContent);
            },
            onerror: (error) => {
                console.error("[TopicLive+] Le chargement direct du changelog a échoué. Affichage du lien de secours.", error);
                const fallbackHtml =
                    'Le chargement automatique a échoué.' +
                    '<br><br>Vous pouvez consulter le changelog directement sur GitHub en cliquant sur le lien ci-dessous :' +
                    `<br><br><a href="${fallbackUrl}" target="_blank" style="color: #007bff; text-decoration: underline;">${fallbackUrl}</a>`;
                $content.html(fallbackHtml);
            }
        });
    }


    toggleForumButtonState() {
        const listIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="17.5" height="17.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
        const replyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="17.5" height="17.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;

        this.forumButtonState = !this.forumButtonState;
        this.$tl_forum_button.addClass('button-transitioning');

        setTimeout(() => {
            if (this.forumButtonState) {
                this.$tl_forum_button.html(replyIconSvg);
                this.$tl_forum_button.css('background-color', 'rgba(0, 123, 255, 0.3)');
            } else {
                this.$tl_forum_button.html(listIconSvg);
                this.$tl_forum_button.css('background-color', 'rgba(22, 22, 22, 0.3)');
            }
            this.$tl_forum_button.removeClass('button-transitioning');
        }, 150);
    }

    scrollToReplyForm() {
        const $replyForm = $('#forums-post-message-editor');
        if ($replyForm.length > 0) {
            const targetScrollTop = $replyForm.offset().top - 100;
            $('html, body').animate({
                scrollTop: targetScrollTop
            }, 800, () => {
                const $textarea = $('#message_topic');
                if ($textarea.length > 0) {
                    $textarea.focus();
                }
            });
        }
    }

    goToForumList() {
        const forumIdMatch = window.location.href.match(/\/forums\/(?:42|1)-(\d+)-/);
        if (forumIdMatch && forumIdMatch[1]) {
            const forumId = forumIdMatch[1];
            const forumUrl = `https://www.jeuxvideo.com/forums/0-${forumId}-0-1-0-1-0-0.htm`;
            window.location.href = forumUrl;
        } else {
            console.warn('[TopicLive+] Could not determine forum ID.');
            window.location.href = 'https://www.jeuxvideo.com/forums.htm';
        }
    }

    initConnectedCounter() {
        this.$tl_connected_counter = $(`<div id="topiclive-connected-counter" class="topiclive-floating-button tl-counter-button"></div>`).hide();
        $('body').append(this.$tl_connected_counter);
    }

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

    updateDesktopButtonPosition() {
        if (!this.$tl_button || !this.$tl_forum_button || !this.$tl_connected_counter || !this.$tl_quick_reply_button) return;

        const isMobileView = $(window).width() < 1250;
        const scrollButtonBottom = isMobileView ? 20 : 25;
        const listButtonBottom = scrollButtonBottom + 35 + 8;
        const replyButtonBottom = listButtonBottom + 35 + 8;
        const counterTop = isMobileView ? 60 : 100;

        if (isMobileView) {
            this.$tl_button.css({ position: 'fixed', bottom: `${scrollButtonBottom}px`, right: '20px', left: 'auto', top: 'auto' });
            this.$tl_forum_button.css({ position: 'fixed', bottom: `${listButtonBottom}px`, right: '20px', left: 'auto', top: 'auto' });
            this.$tl_quick_reply_button.css({ position: 'fixed', bottom: `${replyButtonBottom}px`, right: '20px', left: 'auto', top: 'auto' });
            this.$tl_connected_counter.css({ position: 'fixed', top: `${counterTop}px`, right: '20px', left: 'auto', bottom: 'auto' });
        } else {
            let $container = $('.conteneur-messages-pagi, .conteneur-topic-pagi');

            if ($container.length > 0) {
                const basePositionRight = $container.offset().left + $container.outerWidth() + 15;
                const decalageGauche = 11;
                const counterLeft = basePositionRight - decalageGauche;

                this.$tl_connected_counter.css({ position: 'fixed', top: `${counterTop}px`, left: `${counterLeft}px`, right: 'auto', bottom: 'auto' });
                this.$tl_button.css({ position: 'fixed', bottom: `${scrollButtonBottom}px`, left: `${basePositionRight}px`, right: 'auto', top: 'auto' });
                this.$tl_forum_button.css({ position: 'fixed', bottom: `${listButtonBottom}px`, left: `${basePositionRight}px`, right: 'auto', top: 'auto' });
                this.$tl_quick_reply_button.css({ position: 'fixed', bottom: `${replyButtonBottom}px`, left: `${basePositionRight}px`, right: 'auto', top: 'auto' });
            }
        }
    }

    /**
     * Met à jour le compteur sur la favicon et sur le bouton flottant.
     * Gère l'affichage/masquage du bouton en fonction des options utilisateur.
     */
    updateCounters() {
        if (this.isForumPage) {
            return;
        }

        if (this.isBlocked) {
            const $counter = this.$tl_button.find('.topiclive-counter');
            const cloudflareLogo = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTkuMzUgMTAuMDRDMTguNjcgNi45OSAxNS42NCA0IDEyIDRDOS4xMSA0IDYuNiA1LjY0IDUuMzUgOC4wNEMyLjM0IDguMzYgMCAxMC45MSAwIDE0QzAgMTcuMzEgMi42OSAyMCA2IDIwSDE5QzIxLjc2IDIwIDI0IDE3Ljc2IDI0IDE1QzI0IDEyLjM2IDIxLjk1IDEwLjIyIDE5LjM1IDEwLjA0WiIgZmlsbD0iI0Y0ODAyMiIvPjwvc3ZnPg==';
            $counter.html('').css({
                'background-color': '#ffffff',
                'background-image': `url("${cloudflareLogo}")`,
                'background-size': '16px 16px',
                'background-repeat': 'no-repeat',
                'background-position': 'center'
            });
            this.$tl_button.addClass('has-unread-messages').fadeIn();
            return;
        }

        if (this.is410) {
            const $counter = this.$tl_button.find('.topiclive-counter');
            const errorIcon16 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAALEUExURUxpcf7ihv/0oeuVNfK1Xv7/wf//6uqPMPS3WvzRff/Vc/nOfv/sh//Pbf3WdEI9Rv7iiP7ce//2rv/Nb/zknv/bevutMv/gkv/wrPzgmfbFcvrXjPzkmv7xq//hf//skP3cgv/mhfGvVP/shF1KOXZNMP/Xff3poP/FYf/AXPmaDf/rhO2ePa+Viv/legAPPf62SvvQd/6NFS0rN/SkPfvZiNp0FoZFD7VUFf7ecf6UGP+fIur//xwYIvOIFuiKH+yIGY6Ki59rPi8rM/+dG1JPXXpwY56hqtyxZ+eQKfvTdURDUEZEUF5cZ/n39pZaHU1JUvnWgv7caIqHjXh5hTk4Q9t7F3dzd0FEVTw6RZViOpaUlpqYm/2QE+aGGEkyJI1pTE9MUtTT02daUyorOX99gPSMGBYVIv+REfCLGP+mDPmLFLFuJWRfYuqHFko3LuKEGEZCSf3ajf71s//4uP/riP/qhv/Zdf/lg//efP/1t//qn/3Sb//ll926b/vGbf/NavfWdP/0o/3iesiaXP/pgv/ddP/XcNSfV/q3VvK4VuvDav7uov/BUv/jeP/fdMSUV//aaLNpGv/rkP3GS/+ySN6QH+OvR//faP/ecP/HNP+yJ+aqMf2jIf66KfS3IvmZJKlnG7FiDfzigP/GKNqIGv6UFumNK2tna/+wJvC9Qv/AJuq0OCMiMP+nIvnOX/6kIpSGaC8wR//mdOyQGZ+WkkpLW4d/eO6dGy8sNsybN7qNPfilII2QnHhoXe3s7NbX24JqULO5x519UKCenyktQ66HSjk1Pv6TFG1rcLSwrj9EXS8qL83MzSEeJ8vKzmpmayMfKGRpfjo/TpWYpyomLY6OltDPzzQxOUFAU3x6fmxwfI6KjRscKZORlWpoctTT1Lu9wpqYm42Lj/+YHnJucp6eojc0PS8rMjU0PtiFJPONGDdGz4cAAABxdFJOUwCN+hdmAgIBAwL97P38aAIDY/392/4V/v7bdLu77P78cf2R/QIDAuX9+hj8agf9HP1ybK/nthuaGv7w/AHz4Ha9/uHY/aL9/LX+2kmW/vz9ytr+/fxveP7+bPz8+P7A/v3++/6I/r79AdwWdeb93X3+CABJWgAAAAlwSFlzAAALEwAACxMBAJqcGAAAARtJREFUGNMBEAHv/gAAABAAFiAcFBkbGgMACAcAAAAFABEdehh7fRdyCwQACQAABgABdBIfIR4VCg0TfyIAJgAADnMCDHV4eXd8gCgpiSwAACongiN2foGGh4iKjTCVNDYAMYwrhYOEi5GUkpabnTugPwA1ky6Oj5CXmp6ipamwRKZAAFGjOZmYnJ+kq7i8rrRJpz4ASrNSr6qsurvGw8G+tU22QgBIsUa30NnU0svCxb3AU61QAEWyVM/W3+Da2M3Hyb9XcUMATLlb197n4+LV3MzEyk6oPQBV0VxiZejm4d3b01hHQXEzAEvOYeXpZ21jX2BaT6E3Ly0APFlkb2zqcOvkXcg6MgAAJAAAAGgAamtmaW5eVjgAJQ8Ah7RsxA/wK1MAAABXelRYdFJhdyBwcm9maWxlIHR5cGUgaXB0YwAAeJzj8gwIcVYoKMpPy8xJ5VIAAyMLLmMLEyMTS5MUAxMgRIA0w2QDI7NUIMvY1MjEzMQcxAfLgEigSi4A6hcRdPJCNZUAAAAASUVORK5CYII=';
            $counter.html('').css({
                'background-color': '#FFffff',
                'background-image': `url("${errorIcon16}")`,
                'background-size': '16px 16px',
                'background-repeat': 'no-repeat',
                'background-position': 'center'
            });
            this.$tl_button.addClass('has-unread-messages').fadeIn();
            return;
        }

        let countText = '';
        if (this.nvxMessages > 0) {
            countText = this.nvxMessages > 99 ? '99+' : `${this.nvxMessages}`;
        }
        if (this.options.favicon) {
            this.favicon.maj(countText);
        }

        if (this.nvxMessages > 0) {
            if (this.options.showCounterOnButton) {
                this.$tl_button.find('.topiclive-counter').text(countText).css({
                    'background-color': '#007bff',
                    'background-image': 'none'
                });
                this.$tl_button.addClass('has-unread-messages').fadeIn();
            } else {
                this.$tl_button.fadeOut();
            }
        } else if (!this.isChatModeActive) {
            if (this.options.newMessagesButton) {
                this.$tl_button.removeClass('has-unread-messages').fadeIn();
            } else {
                this.$tl_button.fadeOut();
            }
        } else {
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
     * Initialise tous les composants statiques du script (ceux qui ne dépendent pas de la page).
     * C'est la première fonction appelée au démarrage.
     */
    initStatic() {
        this.favicon = new Favicon();
        this.son = new Audio('https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/notification_sound_tl.mp3');
        this.suivreOnglets();
        this.initScrollButton();
        this.initForumListButton();
        this.initQuickReplyButton();
        this.initConnectedCounter();
        this.initPartialQuoteSystem();
        this.initSettingsMenu();
        this.init();

        addEventListener('instantclick:newpage', this.init.bind(this));
        $("head").append(`<style type='text/css'>.topiclive-loading:after { content: ' ○' }.topiclive-loaded:after { content: ' ●' }</style>`);
        console.log('[TopicLive+] : activé');
    }

    jvCake(classe) {
        const base16 = '0A12B34C56D78E9F';
        let lien = '';
        const s = classe.split(' ')[1];
        for (let i = 0; i < s.length; i += 2) {
            lien += String.fromCharCode(base16.indexOf(s.charAt(i)) * 16 + base16.indexOf(s.charAt(i + 1)));
        }
        return lien;
    }

    alert(message) {
        try {
            modal('erreur', {
                message
            });
        } catch (err) {
            alert(message);
        }
    }

    loop() {
        if (this.isBlocked || this.is410) return;
        if (typeof this.idanalyse !== 'undefined') window.clearTimeout(this.idanalyse);
        let duree = this.ongletActif ? 5000 : 10000;
        this.oldInstance = this.instance;
        this.idanalyse = setTimeout(this.charger.bind(this), duree);
    }

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

    showCloudflareBanner() {
        const bannerId = 'tl-cloudflare-banner';
        if (document.getElementById(bannerId)) return;

        const bannerCSS = `
            #${bannerId} {
                display: flex; align-items: center; justify-content: center;
                position: fixed; top: 25%; width: auto;
                background-color: rgba(22, 22, 22, 0.5);
                backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
                color: #FFFFFF; text-align: center;
                padding: 15px 25px; font-size: 16px; font-weight: bold;
                z-index: 99999; border-radius: 8px; border: 1px solid #F48022;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                opacity: 0; visibility: hidden;
                transition: opacity 0.4s ease-out;
            }
            #${bannerId}.visible { opacity: 1; visibility: visible; }
            #${bannerId} svg { width: 24px; height: 24px; margin-right: 15px; flex-shrink: 0; }
        `;
        $('head').append(`<style type='text/css'>${bannerCSS}</style>`);

        const cloudflareLogoSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04Z" fill="#F48022"/></svg>`;
        const bannerText = 'Cloudflare : Actualisez la page pour effectuer la vérification';
        const $banner = $(`<div id="${bannerId}">${cloudflareLogoSVG}<span>${bannerText}</span></div>`);
        $('body').prepend($banner);

        const positionBanner = () => {
            if ($(window).width() < 1250) {
                $banner.css({ 'left': '50%', 'transform': 'translate(-50%, -50%)' });
            } else {
                const $container = $('.conteneur-messages-pagi');
                if ($container.length > 0) {
                    const bannerLeft = $container.offset().left + ($container.outerWidth() / 2) - ($banner.outerWidth() / 2);
                    $banner.css({ 'left': bannerLeft + 'px', 'transform': 'translateY(-50%)' });
                }
            }
        };

        positionBanner();
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

    show410Banner() {
        try {
            const bannerId = 'tl-410-banner';
            if (document.getElementById(bannerId)) return;

            const bannerCSS = `
                #${bannerId} {
                    display: flex; align-items: center; justify-content: center;
                    position: fixed; top: 25%; width: auto;
                    background-color: rgba(22, 22, 22, 0.5);
                    backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
                    color: #FFFFFF; text-align: center;
                    padding: 15px 25px; font-size: 16px; font-weight: bold;
                    z-index: 99999; border-radius: 8px; border: 1px solid #FFFFFF;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    opacity: 0; visibility: hidden;
                    transition: opacity 0.4s ease-out;
                }
                #${bannerId}.visible { opacity: 1; visibility: visible; }
                #${bannerId} .tl-410-icon {
                    width: 24px; height: 24px; margin-right: 15px; flex-shrink: 0;
                }
            `;
            $('head').append(`<style type='text/css'>${bannerCSS}</style>`);

            const errorIcon24 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAMAAADXqc3KAAACeVBMVEUAAAD8+/siHib7lxv+1mk6OEUmIiv+pyNHR1b+43r+uCksKTT8ixf+3HL+64v/6YT+wS00Mjz+44MYFBz+03P+23v+zGtVVmZCQkz+w1vqiBSsWgv++sv/8JHp6Oj/niD944rX1tf+7JH+3YIwLjf+yWP+xGPGllf+u1QdGSLtkxbleRb9vFr9s0uXlpmIhopVU1n++8T+9MO2tbdoaHPBiUrGxsdAPUnkdgv+1Xp3dXn+87z+87Wnpqn8oR1oZWr97Kv8zHFXWnD/0V1XSUXqpCf98pv65JPInmJLTWL+q0P/xzvoiCTx8O/96rT+/KL+7Jnys1LDjFD97br886L724z/yEXohzX+/qr866L93ZxeYHJxbnFPUmbqm1X9tlP9qjbomijHdhTogg3Pz9H+9smurbL986z64pmDe3Tqxmj8vWXLpGP3u1v/tzirYw3g3d3CwMP65KWdnKKIiZL7zIX1035kXF/jtV3Wplqaelr2t1b6r0r2qUJrU0HXlDXajDPlfijHeSPZihoRDRTU0c7++7PDubP85Kv625T904p5eoWKgnn1zHL/xWr2xWmSeGLzq1RSTlPLkE7ntEcvMkCUZDtDOzt4VDq8eznqpTjrlzXLgzS4dCnYfiTNiRrafxe4axPm4t7++r6zqqSlnJf3ypb1woz204jyuoLrsn713H2Ui3z9ynvwzXnprXf203O2oHL1yXGql2/dvGzyr2x6cmvTqmXlu2Lzq2G9l17LoFnXsFaqflHwnE3rlUfrq0WodzOrcC63bSW3ZQ6qoJ2RjI+lmHXatnDNsG2Zg2fywmTzqVuRb1Z0XVGieUvyp0jpikFkT0HaCA+lAAAAAXRSTlMAQObYZgAAAAlwSFlzAAALEwAACxMBAJqcGAAABO5pVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDkuMS1jMDAxIDc5LjE0NjI4OTksIDIwMjMvMDYvMjUtMjA6MDE6NTUgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIiB4bWxuczpwaG90b3Nob3A9Imh0dHA6Ly9ucy5hZG9iZS5jb20vcGhvdG9zaG9wLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdEV2dD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlRXZlbnQjIiB4bXA6Q3JlYXRvclRvb2w9IkFkb2JlIFBob3Rvc2hvcCAyNS4zIChXaW5kb3dzKSIgeG1wOkNyZWF0ZURhdGU9IjIwMjUtMDktMDJUMDE6NTY6NDUrMDI6MDAiIHhtcDpNb2RpZnlEYXRlPSIyMDI1LTA5LTAyVDAzOjMzOjQxKzAyOjAwIiB4bXA6TWV0YWRhdGFEYXRlPSIyMDI1LTA5LTAyVDAzOjMzOjQxKzAyOjAwIiBkYzpmb3JtYXQ9ImltYWdlL3BuZyIgcGhvdG9zaG9wOkNvbG9yTW9kZT0iMiIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpiMjYyYmUwOC04OWExLTE1NGItOGZhYS1mOTVmNDcxNjE1ZmEiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6YjI2MmJlMDgtODlhMS0xNTRiLThmYWEtZjk1ZjQ3MTYxNWZhIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6YjI2MmJlMDgtODlhMS0xNTRiLThmYWEtZjk1ZjQ3MTYxNWZhIj4gPHhtcE1NOkhpc3Rvcnk+IDxyZGY6U2VxPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0iY3JlYXRlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpiMjYyYmUwOC04OWExLTE1NGItOGZhYS1mOTVmNDcxNjE1ZmEiIHN0RXZ0OndoZW49IjIwMjUtMDktMDJUMDE6NTY6NDUrMDI6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyNS4zIChXaW5kb3dzKSIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz6AltmBAAAB9klEQVQokV1Sz2vTcBx9n883SX8k7cziZsBOLZQyWzA6x+bJoghDmBuIDBSdlyLozjuJA0X8A7yIJw+ioggDL8p2mAdRROpFq45NqtUdxmraNbi0abN4cCviuzweDx68xwO2Md2789jFhx1Jf2nqZ3mtFwmgPjQxCAAQAID00We5HSW3sva1S7zJv+gY4+W1jVIxUm/1/dr9diKIftmKGi9kliuQIBCgliTHuDUGCKB/w61UQewqQa2RJMdo1/uLYKRzPVgn6YKrNWrdY3DQlt+nAUb74+c6eQ/mH1VdXBvZZ9sl/dOPUQhkexbhQQvsAkYGZgY+AN8TrxyHp7HgeZBi0bimLZQBwJSA1Um6eseF5AKHlgAPetUH2kAkznUXLQCnr8Dz4Ff87UmkeAtwc+G5OQD+ubOzi8V1GVB1ZuDS85OroVBjc5OWn9x7nWg2I749JS6XWn335yMrzTOxcuC/pGAl2upytRRgDsukWnI4mSTdolRqF1mqopqALBPtyasKHVBUnRQ+ZdFTi1VCCvJvNbQEvwk5ZpNud8e/ye0IoChElGeDdGI+bHCO6PxtxQQUNoYOMrNJN5mt/YqqD58AAKhsWMzMiq7K4Zm7mpY5stUxbA4WbgghhBCapmUy1/89A0Yr7wDguLP3Mf7DbDabzU525B+VgKLP+4NhawAAAABJRU5ErkJggg==';
            const bannerText = "410 : Topic censuré par la liberté d'expression";

            const $banner = $(`<div id="${bannerId}"></div>`);
            const $icon = $(`<img class="tl-410-icon" alt="Erreur 410">`);
            const $text = $(`<span>${bannerText}</span>`);

            $icon.attr('src', errorIcon24);
            $banner.append($icon).append($text);
            $('body').prepend($banner);

            const positionBanner = () => {
                if ($(window).width() < 1250) {
                    $banner.css({ 'left': '50%', 'transform': 'translate(-50%, -50%)' });
                } else {
                    const $container = $('.conteneur-messages-pagi, .conteneur-topic-pagi');
                    if ($container.length > 0) {
                        const bannerLeft = $container.offset().left + ($container.outerWidth() / 2) - ($banner.outerWidth() / 2);
                        $banner.css({ 'left': bannerLeft + 'px', 'transform': 'translateY(-50%)' });
                    }
                }
            };

            positionBanner();
            requestAnimationFrame(() => {
                $banner.addClass('visible');
            });
            $(window).off('resize.410banner').on('resize.410banner', positionBanner);

        } catch (err) {
            console.error("[TopicLive+] ERREUR DANS show410Banner:", err);
        }
    }

    GET(cb) {
        const blocChargement = $('#bloc-formulaire-forum .titre-bloc');
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
                setTimeout(() => {
                    blocChargement.removeClass('topiclive-loaded');
                }, 100);
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

    loopForum() {
        if (typeof this.idForumAnalyse !== 'undefined') window.clearTimeout(this.idForumAnalyse);
        let duree = this.ongletActif ? 15000 : 30000;
        this.oldInstance = this.instance;
        this.idForumAnalyse = setTimeout(this.chargerForum.bind(this), duree);
    }

    chargerForum() {
        if (this.oldInstance != this.instance) {
            return;
        }
        $.ajax({
            type: 'GET',
            url: this.url,
            timeout: 5000,
            success: (data) => {
                if (this.oldInstance != this.instance) return;
                this.scanForumPageAndUpdate($(data));
                this.loopForum();
            },
            error: () => {
                if (this.oldInstance == this.instance) this.loopForum();
            }
        });
    }

    scanForumPageAndUpdate($page) {
        const connectesText = $page.find('.nb-connect-fofo').text().trim();
        if (connectesText && this.$tl_connected_counter) {
            const connectesCount = connectesText.split(' ')[0];
            this.$tl_connected_counter.text(connectesCount);
        }
    }
}

var TL = new TopicLive();
TL.initStatic();
