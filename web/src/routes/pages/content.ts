// Pages d'information (plan Task 25, retours UI5) : Sécurité, Confidentialité, Conditions
// d'utilisation, Mentions légales, Signaler un abus. Textes relus sur la spécification
// (docs/superpowers/specs/2026-11-03-shhdrop-design.md : §2, §5.3, §7, §9, §18, §35, §36, §41.4,
// §41.8, D41-28, D41-29). Règles : jamais « 100 % », aucune allégation d'audit ni de pays
// d'hébergement (plan B3), aucune identité d'éditeur ni d'hébergeur inventée (champs « à
// compléter par le propriétaire »), aucune adresse e-mail. Chiffres lus dans les constantes.
// Compte par e-mail (plan du compte, lot 16 ; conception compte §16, §21.18) : les textes qui
// DÉCRIVENT le compte ne s'ajoutent qu'avec __COMPTES__ (COMPTE_FR, COMPTE_EN) : le site public
// n'annonce pas une fonction absente. Les phrases communes restent vraies dans les deux cas.
import { CONTENT_MAX, MAX_ITEMS, MAX_OPENS, PW_TRIES, TTL_MAX_HOURS } from "../../limits";
import { formatBytes, type Lang } from "../../i18n/format";

export type InfoName = "securite" | "confidentialite" | "conditions" | "mentions" | "signaler";
export type Block = { id?: string; h: string; p?: string[]; list?: string[] };
/** Section repliée en bas de page (Sécurité : détails techniques pour les experts, liens publics). */
export type Tech = { h: string; p?: string[]; list?: string[]; links: { label: string; url: string }[] };
export type InfoPage = { title: string; lede: string; draft?: boolean; blocks: Block[]; tech?: Tech };

/** Dépôt public du code (lien sortant simple : rien n'est chargé depuis GitHub). */
export const SOURCE_URL = "https://github.com/Skoow/shhdrop";
export const LICENSE_URL = "https://github.com/Skoow/shhdrop/blob/main/LICENSE";
export const SPEC_URL = "https://github.com/Skoow/shhdrop/blob/main/docs/superpowers/specs/2026-11-03-shhdrop-design.md";

/** `comptes` : drapeau de construction __COMPTES__ (paramètre pour les tests). */
export function infoPage(name: InfoName, lang: Lang, comptes: boolean = __COMPTES__): InfoPage {
  const size = formatBytes(CONTENT_MAX, lang);
  const v = { size, n: MAX_ITEMS, h: TTL_MAX_HOURS, tries: PW_TRIES, opens: MAX_OPENS };
  const page = (lang === "fr" ? FR : EN)[name](v);
  const f = comptes ? (lang === "fr" ? COMPTE_FR : COMPTE_EN)[name] : undefined;
  return f ? f(page) : page;
}

/** Insère `ajout` après le bloc de titre `apres` (à la fin s'il n'existe pas). */
function inserer(blocks: Block[], apres: string, ajout: Block): Block[] {
  const i = blocks.findIndex((b) => b.h === apres);
  return i < 0 ? [...blocks, ajout] : [...blocks.slice(0, i + 1), ajout, ...blocks.slice(i + 1)];
}
function remplacer(blocks: Block[], h: string, nouveau: Block): Block[] {
  return blocks.map((b) => (b.h === h ? nouveau : b));
}

type V = { size: string; n: number; h: number; tries: number; opens: number };

const FR: Record<InfoName, (v: V) => InfoPage> = {
  securite: (v) => ({
    title: "Sécurité",
    lede: "Ce que Shhgone protège, comment, et ce qu'il ne peut pas faire. Aucune protection n'est parfaite : voici ce qui est vrai aujourd'hui.",
    blocks: [
      {
        id: "chiffrement",
        h: "Fermé à clé sur votre appareil",
        p: [
          "Vos fichiers et vos textes sont chiffrés dans votre navigateur, avant de partir. Ce qui arrive sur notre serveur est illisible sans la clé, pour nous comme pour n'importe qui d'autre.",
          "Le mot de passe est volontairement lent à vérifier : essayer des mots de passe au hasard coûte très cher à qui voudrait le deviner.",
          "Les noms de fichiers, leurs types et vos textes sont chiffrés aussi : nous ne pouvons pas les lire.",
        ],
      },
      {
        id: "lien",
        h: "Le lien et le mot de passe",
        p: [
          "La clé est cachée dans la fin du lien, après le signe #. Les navigateurs n'envoient jamais cette partie à un serveur. Il faut le lien et le mot de passe pour ouvrir un partage : notre serveur n'a ni l'un ni l'autre.",
          `Après ${v.tries} mots de passe faux, le partage est détruit. Il s'efface aussi à la fin de sa durée (${v.h} h au plus en gratuit) ou après le nombre d'ouvertures choisi (${v.opens} au plus).`,
        ],
      },
      {
        id: "serveur",
        h: "Ce que voit notre serveur",
        list: [
          "Des données chiffrées, dont la taille est arrondie. Jamais la clé ni le mot de passe.",
          "Votre adresse IP pendant la connexion, comme pour tout site web. Elle n'est écrite nulle part.",
          "La taille approximative d'un partage, l'heure des envois et des ouvertures, et quels morceaux chiffrés sont lus.",
          "Aucune date de création n'est gardée ; les heures de fin sont arrondies au quart d'heure.",
        ],
      },
      {
        id: "sortie",
        h: "Après la dernière ouverture",
        p: [
          "Quand toutes les ouvertures sont prises, personne d'autre ne peut entrer. Chaque personne qui a ouvert le partage peut y revenir depuis le même navigateur jusqu'à la fin de sa durée, sans compter d'ouverture : le contenu chiffré reste donc sur le serveur jusque-là. La dernière personne peut le détruire tout de suite ; sinon, il est effacé à la fin de la durée choisie à l'envoi.",
          "Pour revenir, ce navigateur garde l'autorisation d'ouverture, chiffrée, jamais la clé ni le mot de passe ; il faut rouvrir le lien et retaper le mot de passe. Depuis un autre appareil, en navigation privée ou après un redémarrage de notre serveur, le retour n'est plus possible si toutes les ouvertures sont prises.",
        ],
      },
      {
        id: "limites",
        h: "Ce que Shhgone ne peut pas faire",
        list: [
          "Empêcher une capture d'écran, une photo de l'écran ou une copie : ce que le destinataire voit ou télécharge lui appartient.",
          "Effacer l'historique de votre navigateur. Nous retirons la clé de la barre d'adresse, mais le navigateur a déjà noté l'adresse complète dans son historique (parfois synchronisé). Ouvrez le lien en navigation privée pour laisser moins de traces.",
          "Garantir que la mémoire de l'appareil est vidée : nous l'effaçons du mieux possible. Pour qu'un rechargement ne coûte pas une ouverture, le lien et un jeton d'ouverture restent dans le stockage de cet onglet le temps de l'ouverture (jamais le mot de passe ni le contenu).",
          "Tout effacer dans les fichiers. Photos, PDF et documents bureautiques perdent leurs informations cachées (lieu, appareil, auteur, dates), comme les vidéos et les vocaux enregistrés ici. Les vidéos et les sons importés, et les archives, partent tels quels : leur ligne le dit. Ce qui se voit dans l'image ou se lit dans le document reste : la vignette d'aperçu d'une photo est gardée (elle peut montrer la photo d'avant un recadrage ou une retouche), un PDF ne perd que ses propriétés de document (ses pages, leurs miniatures et ses images restent telles quelles), les commentaires d'un document gardent leurs auteurs, et un PDF modifié plusieurs fois peut garder d'anciens passages.",
          "Vérifier l'expéditeur : un lien peut venir de n'importe qui.",
          "Vous protéger d'un site piégé : si notre serveur ou notre code était compromis, le site servi pourrait voler les clés. C'est pour cela que le code est public et que chaque version peut être vérifiée.",
          "Cacher votre adresse IP au serveur et à l'hébergeur pendant la connexion.",
        ],
      },
      {
        id: "qr",
        h: "QR code et partage en un geste",
        p: [
          "« Partager » peut envoyer le lien et le mot de passe ensemble, et le QR code les contient tous les deux. Avec une seule ouverture (le réglage par défaut), personne d'autre ne pourra voir le contenu ensuite, et le destinataire verrait qu'il a déjà été ouvert.",
          "Mais quelqu'un qui lit le message avant le destinataire peut l'ouvrir à sa place, et l'adresse du QR (lien et mot de passe) reste dans l'historique du navigateur qui l'ouvre. Pour plus de sûreté, envoyez le lien et le mot de passe par deux moyens différents.",
        ],
      },
      {
        id: "appareil",
        h: "Caméra et micro",
        p: [
          "Le site ne peut utiliser la caméra et le micro que pour ses propres enregistrements, après votre accord, et jamais à l'intérieur d'un autre site. Les autres fonctions sensibles du navigateur lui sont fermées.",
        ],
      },
    ],
    tech: {
      h: "Détails techniques (pour les experts)",
      list: [
        "Contenu, noms, types et textes : AES-256-GCM (WebCrypto), clés dérivées par HKDF-SHA-256 ; aucune cryptographie maison.",
        "Mot de passe : Argon2id (RustCrypto, dans le moteur WebAssembly du site), 64 Mio de mémoire, 3 passes, combiné à la clé du fragment du lien (après #), jamais transmise au serveur.",
        `Ouverture : le serveur vérifie une preuve dérivée de la clé et du mot de passe, sans recevoir ni l'une ni l'autre ; ${v.tries} preuves fausses détruisent le partage.`,
        "Taille : le contenu chiffré occupe des paliers fixes ; le serveur ne connaît que le palier.",
        "Navigateur : en-têtes stricts (Content-Security-Policy, Permissions-Policy) ; aucun script, police ni traceur d'un autre site. Seule exception, la vérification anti-robot de secours (Google reCAPTCHA), chargée après un clic dans un cadre isolé sur un autre site, jamais sur une page qui détient des clés.",
      ],
      links: [
        { label: "Code source public (GitHub)", url: SOURCE_URL },
        { label: "Spécification publique", url: SPEC_URL },
      ],
    },
  }),
  confidentialite: (v) => ({
    title: "Confidentialité",
    lede: "Sans compte, ni pour envoyer, ni pour recevoir. Aucun traceur, aucune mesure d'audience, aucune publicité.",
    blocks: [
      {
        h: "Ce que nous gardons",
        list: [
          "Le contenu chiffré et le strict nécessaire pour le servir : sa taille arrondie, son échéance arrondie au quart d'heure, le nombre d'ouvertures restantes et d'essais ratés, des vérificateurs qui ne permettent pas de déchiffrer.",
          "Rien de cela ne contient votre nom, votre adresse e-mail, votre adresse IP, le nom de vos fichiers ou leur contenu en clair.",
          `Tout est effacé à l'échéance (${v.h} h au plus en gratuit), après la dernière ouverture, ou à la destruction.`,
        ],
      },
      {
        h: "Ce que nous ne gardons pas",
        list: [
          "Votre adresse IP n'est pas enregistrée. Le serveur la voit le temps de la connexion, comme tout site web, mais ne l'écrit nulle part.",
          "Aucun cookie. Pas de cookie de mesure, donc pas de bandeau.",
          "Aucun journal des partages, aucune mesure d'audience. Le serveur tient seulement, en mémoire, des compteurs globaux pour son exploitation (par exemple le nombre de partages créés depuis son dernier démarrage) : rien par personne, par adresse ni par partage, rien sur disque.",
        ],
      },
      {
        h: "Sur votre appareil",
        list: [
          "Le contenu déchiffré reste en mémoire et n'est jamais écrit dans le stockage du navigateur.",
          "Le lien et un jeton d'ouverture restent dans le stockage de l'onglet le temps de l'ouverture, pour qu'un rechargement ne coûte pas une ouverture.",
          "Vos préférences (langue) restent sur votre appareil.",
          "Si vous cochez « Garder ce partage », le lien reçu (avec sa clé), sa taille et son échéance sont gardés chiffrés sur cet appareil, jamais le mot de passe. Ils s'effacent 7 jours après l'échéance, ou quand vous les retirez.",
          "L'historique des téléchargements (nom, taille et sorte de chaque fichier enregistré, sa provenance et l'heure) reste chiffré sur cet appareil et n'est jamais envoyé ; jamais le lien ni le mot de passe. Chaque entrée s'efface après 30 jours ; la page Téléchargements permet de le couper ou de tout effacer.",
        ],
      },
      {
        id: "verification",
        h: "Vérification anti-robot",
        p: [
          "Une petite preuve de calcul est faite par votre navigateur, sans service extérieur. Si elle échoue, un repli Google reCAPTCHA peut être proposé, seulement après un clic et dans un cadre isolé sur un autre site, jamais sur une page qui détient des clés. Google voit alors votre adresse IP ; notre serveur, jamais.",
        ],
      },
      {
        h: "Vos droits",
        p: [
          "Nous ne savons pas qui vous êtes : il n'y a donc pas de données personnelles à vous rendre ou à corriger. Un partage peut être détruit à tout moment par son expéditeur (lien de gestion) ou, à la dernière ouverture, par son destinataire.",
        ],
      },
    ],
  }),
  conditions: () => ({
    title: "Conditions d'utilisation",
    lede: "Les règles d'usage de Shhgone.",
    draft: true,
    blocks: [
      { h: "Usage autorisé", p: ["Shhgone sert à transmettre des contenus de façon privée. Il est interdit de l'utiliser pour diffuser des contenus illégaux ou pour nuire à autrui."] },
      { h: "Signalement", p: ["Tout destinataire peut signaler un partage : il est alors détruit tout de suite. Voir « Signaler un abus »."] },
      { h: "Responsabilité", p: ["À compléter par le propriétaire."] },
      { h: "Droit applicable", p: ["À compléter par le propriétaire."] },
    ],
  }),
  mentions: () => ({
    title: "Mentions légales",
    lede: "Informations sur l'éditeur et l'hébergeur du site.",
    draft: true,
    blocks: [
      { h: "Éditeur", list: ["Nom ou raison sociale : à compléter par le propriétaire.", "Adresse : à compléter par le propriétaire.", "Contact : à compléter par le propriétaire.", "Directeur de la publication : à compléter par le propriétaire."] },
      { h: "Hébergeur", list: ["Nom : à compléter par le propriétaire.", "Adresse : à compléter par le propriétaire."] },
      { h: "Code source", p: ["Le code de Shhgone est public, sous licence AGPL-3.0."] },
    ],
  }),
  signaler: (v) => ({
    title: "Signaler un abus",
    lede: "Un partage illégal ou malveillant ? Vous pouvez le détruire vous-même, tout de suite.",
    blocks: [
      {
        h: "Depuis le partage",
        list: [
          "Ouvrez le partage avec son lien et son mot de passe.",
          "Le partage ouvert, touchez « Signaler ce partage » en bas de la page, dans le pied (colonne « Confiance »), choisissez ce qui se passe, puis touchez « Signaler et détruire ».",
          "Le partage est détruit aussitôt pour tout le monde : les téléchargements en cours sont coupés, aucune ouverture ne reste possible.",
        ],
      },
      {
        h: "Ce que nous recevons",
        p: [
          "Le signalement ne contient que la catégorie choisie (par exemple « Arnaque ») : ni le contenu, ni qui vous êtes. Nous ne pouvons pas lire le partage. Nous comptons, en mémoire seulement, les signalements par catégorie depuis le dernier démarrage du serveur et leur nombre dans l'heure, pour repérer un abus massif ; rien n'est écrit sur disque.",
          `Sans le mot de passe, rien ne peut être fait sur le partage : il s'effacera seul à son échéance (${v.h} h au plus en gratuit).`,
        ],
      },
    ],
  }),
};

const EN: Record<InfoName, (v: V) => InfoPage> = {
  securite: (v) => ({
    title: "Security",
    lede: "What Shhgone protects, how, and what it cannot do. No protection is perfect: here is what is true today.",
    blocks: [
      {
        id: "chiffrement",
        h: "Locked on your device",
        p: [
          "Your files and texts are encrypted in your browser before they leave. What reaches our server is unreadable without the key, for us as for anyone else.",
          "The password is deliberately slow to check: trying passwords at random is very expensive for anyone who wants to guess it.",
          "File names, their types and your texts are encrypted too: we can't read them.",
        ],
      },
      {
        id: "lien",
        h: "The link and the password",
        p: [
          "The key is hidden at the end of the link, after the # sign. Browsers never send that part to a server. Opening a share takes the link and the password: our server has neither.",
          `After ${v.tries} wrong passwords, the share is destroyed. It is also erased when its time runs out (${v.h} h at most on the free plan) or after the chosen number of opens (${v.opens} at most).`,
        ],
      },
      {
        id: "serveur",
        h: "What our server sees",
        list: [
          "Encrypted data, with a rounded size. Never the key or the password.",
          "Your IP address while you are connected, like any website. It is never written down.",
          "The approximate size of a share, when it is sent and opened, and which encrypted pieces are read.",
          "No creation date is kept; end times are rounded to the quarter hour.",
        ],
      },
      {
        id: "sortie",
        h: "After the last open",
        p: [
          "Once all opens are used, nobody else can get in. Each person who opened the share can come back to it from the same browser until its time runs out, without using an open: the encrypted content therefore stays on the server until then. The last person can destroy it right away; otherwise it is erased at the end of the duration chosen when sending.",
          "To come back, this browser keeps the open permission, encrypted, never the key or the password; you reopen the link and type the password again. From another device, in a private window or after our server restarts, coming back is no longer possible once all opens are used.",
        ],
      },
      {
        id: "limites",
        h: "What Shhgone cannot do",
        list: [
          "Prevent a screenshot, a photo of the screen or a copy: what the recipient sees or downloads is theirs.",
          "Erase your browser history. We remove the key from the address bar, but the browser has already recorded the full address in its history (sometimes synced). Open the link in a private window to leave fewer traces.",
          "Guarantee the device's memory is wiped: we clear it as best we can. So that a reload doesn't cost an open, the link and an open token stay in this tab's storage while the share is open (never the password or the content).",
          "Remove everything from files. Photos, PDFs and office documents lose their hidden information (location, device, author, dates), as do videos and voice notes recorded here. Imported videos and sounds, and archives, are sent as they are: their row says so. What is visible in the picture or readable in the document stays: a photo keeps its preview thumbnail (it may show the photo as it was before cropping or editing), a PDF only loses its document properties (its pages, their thumbnails and its images stay as they are), comments in a document keep their authors, and a PDF edited several times may keep older passages.",
          "Verify the sender: a link can come from anyone.",
          "Protect you from a tampered site: if our server or code were compromised, the site could steal keys. That is why the code is public and every version can be verified.",
          "Hide your IP address from the server and the host while you are connected.",
        ],
      },
      {
        id: "qr",
        h: "QR code and one-tap sharing",
        p: [
          "“Share” can send the link and the password together, and the QR code holds both. With a single open (the default), nobody else can see the content afterwards, and the recipient would see it had already been opened.",
          "But someone who reads the message before the recipient can open it in their place, and the QR address (link and password) stays in the history of the browser that opens it. To be safer, send the link and the password through two different channels.",
        ],
      },
      {
        id: "appareil",
        h: "Camera and microphone",
        p: [
          "The site can only use the camera and microphone for its own recordings, after you agree, and never inside another site. The browser's other sensitive features are closed to it.",
        ],
      },
    ],
    tech: {
      h: "Technical details (for experts)",
      list: [
        "Content, names, types and texts: AES-256-GCM (WebCrypto), keys derived with HKDF-SHA-256; no home-made cryptography.",
        "Password: Argon2id (RustCrypto, in the site's WebAssembly engine), 64 MiB of memory, 3 passes, combined with the key in the link fragment (after #), which is never sent to the server.",
        `Opening: the server checks a proof derived from the key and the password, without receiving either; ${v.tries} wrong proofs destroy the share.`,
        "Size: encrypted content fills fixed tiers; the server only knows the tier.",
        "Browser: strict headers (Content-Security-Policy, Permissions-Policy); no script, font or tracker from another site. The one exception is the fallback bot check (Google reCAPTCHA), loaded after a click in an isolated frame on another site, never on a page that holds keys.",
      ],
      links: [
        { label: "Public source code (GitHub)", url: SOURCE_URL },
        { label: "Public specification", url: SPEC_URL },
      ],
    },
  }),
  confidentialite: (v) => ({
    title: "Privacy",
    lede: "No account, to send or to receive. No trackers, no audience measurement, no ads.",
    blocks: [
      {
        h: "What we keep",
        list: [
          "The encrypted content and only what is needed to serve it: its rounded size, its expiry rounded to the quarter hour, the opens and failed attempts left, and verifiers that cannot decrypt anything.",
          "None of it holds your name, email address, IP address, file names or readable content.",
          `Everything is erased when it expires (${v.h} h at most on the free plan), after the last open, or when destroyed.`,
        ],
      },
      {
        h: "What we don't keep",
        list: [
          "Your IP address is not recorded. The server sees it while you are connected, like any website, but never writes it down.",
          "No cookies. No measurement cookies, so no banner.",
          "No log of shares, no audience measurement. The server only keeps, in memory, global counters for its own operation (for example the number of shares created since it last started): nothing per person, per address or per share, nothing on disk.",
        ],
      },
      {
        h: "On your device",
        list: [
          "Decrypted content stays in memory and is never written to browser storage.",
          "The link and an open token stay in the tab's storage while the share is open, so a reload doesn't cost an open.",
          "Your preferences (language) stay on your device.",
          "If you tick “Keep this share”, the received link (with its key), its size and its expiry are kept encrypted on this device, never the password. They are erased 7 days after expiry, or when you remove them.",
          "The downloads history (name, size and kind of each saved file, where it came from and the time) stays encrypted on this device and is never sent; never the link or the password. Each entry is erased after 30 days; the Downloads page lets you turn it off or erase it all.",
        ],
      },
      {
        id: "verification",
        h: "Bot check",
        p: [
          "Your browser solves a small proof of work, with no outside service. If it fails, a Google reCAPTCHA fallback may be offered, only after a click and inside an isolated frame on another site, never on a page that holds keys. Google then sees your IP address; our server never does.",
        ],
      },
      {
        h: "Your rights",
        p: [
          "We don't know who you are, so there is no personal data to hand back or correct. A share can be destroyed at any time by its sender (management link) or, at the last open, by its recipient.",
        ],
      },
    ],
  }),
  conditions: () => ({
    title: "Terms of use",
    lede: "The rules for using Shhgone.",
    draft: true,
    blocks: [
      { h: "Allowed use", p: ["Shhgone is for sending content privately. Using it to spread illegal content or to harm others is forbidden."] },
      { h: "Reporting", p: ["Any recipient can report a share: it is destroyed at once. See “Report abuse”."] },
      { h: "Liability", p: ["To be completed by the owner."] },
      { h: "Governing law", p: ["To be completed by the owner."] },
    ],
  }),
  mentions: () => ({
    title: "Legal notice",
    lede: "Information about the publisher and the host of this site.",
    draft: true,
    blocks: [
      { h: "Publisher", list: ["Name or company: to be completed by the owner.", "Address: to be completed by the owner.", "Contact: to be completed by the owner.", "Publication director: to be completed by the owner."] },
      { h: "Host", list: ["Name: to be completed by the owner.", "Address: to be completed by the owner."] },
      { h: "Source code", p: ["Shhgone's code is public, under the AGPL-3.0 license."] },
    ],
  }),
  signaler: (v) => ({
    title: "Report abuse",
    lede: "An illegal or malicious share? You can destroy it yourself, right away.",
    blocks: [
      {
        h: "From the share",
        list: [
          "Open the share with its link and password.",
          "With the share open, tap “Report this share” at the bottom of the page, in the footer (“Trust” column), choose what is going on, then tap “Report and destroy”.",
          "The share is destroyed at once for everyone: downloads in progress are cut, no open remains possible.",
        ],
      },
      {
        h: "What we receive",
        p: [
          "A report holds only the category you chose (for example “Scam”): neither the content nor who you are. We cannot read the share. We count, in memory only, reports per category since the server last started and their number per hour, to spot mass abuse; nothing is written to disk.",
          `Without the password, nothing can be done to the share: it erases itself when it expires (${v.h} h at most on the free plan).`,
        ],
      },
    ],
  }),
};

// --- Avec le compte (__COMPTES__ seulement ; conception compte §16, §21.18 ; à relire par le juriste) ---

const COMPTE_FR: Partial<Record<InfoName, (p: InfoPage) => InfoPage>> = {
  confidentialite: (p) => ({
    ...p,
    lede: "Sans compte pour envoyer, recevoir ou rejoindre un salon. Aucun traceur, aucune mesure d'audience, aucune publicité.",
    blocks: remplacer(
      inserer(p.blocks, "Ce que nous ne gardons pas", {
        id: "compte",
        h: "Si vous créez un compte (pour créer des salons)",
        list: [
          "Votre adresse e-mail n'est gardée qu'en empreinte (un calcul à sens unique, avec une clé secrète du serveur) : nous ne la gardons pas en clair. Elle passe par notre serveur le temps d'envoyer un code, et par notre fournisseur d'envoi d'e-mails (nom à compléter par le propriétaire), qui voit l'adresse, l'heure et le code. L'e-mail ne contient que le code.",
          "Votre mot de passe ne quitte jamais votre appareil : le serveur reçoit seulement une valeur qui en est tirée, et n'en garde qu'une empreinte.",
          "Votre pseudo, votre photo, votre langue et votre abonnement sont chiffrés, mais gardés de façon à pouvoir vous être rendus si vous oubliez votre mot de passe : le service peut donc les lire. Votre pseudo n'est gardé qu'en empreinte, pour qu'il reste unique.",
          "Vos liens, les salons que vous rejoignez et la gestion de vos salons et partages sont dans un second coffre, chiffré par votre mot de passe seulement : nous ne pouvons pas les lire. Après un mot de passe oublié, ce coffre est perdu, sauf ce qui est encore sur un de vos appareils.",
          "Nous savons quels salons votre compte a créés, le temps de leur vie, pour pouvoir bannir un compte qui nuit ; jamais quels partages.",
          "Dates gardées au jour (création, ancienneté), dernière connexion au mois : aucune heure, aucune adresse IP, aucun nom d'appareil en clair.",
          "Signalements : seulement leur catégorie, comptée en mémoire. Un bannissement garde l'empreinte de l'adresse, sa durée (3 ans par défaut) et sa catégorie, montrée à la personne ; un recours est possible.",
          "Après une récupération par e-mail, l'adresse ne peut pas être changée ni le compte supprimé pendant 7 jours, par sécurité.",
          "La base des comptes est sauvegardée chaque jour, chiffrée, chez un autre hébergeur ; chaque copie est effacée après 30 jours. Un compte supprimé peut donc rester jusqu'à 30 jours dans ces copies.",
          "Sans connexion pendant 13 mois, le compte est effacé. Nous ne pouvons pas vous prévenir : nous n'avons pas votre adresse.",
        ],
      }),
      "Vos droits",
      {
        h: "Vos droits",
        p: [
          "Sans compte, nous ne savons pas qui vous êtes : il n'y a pas de données personnelles à vous rendre ou à corriger. Un partage peut être détruit à tout moment par son expéditeur (lien de gestion) ou, à la dernière ouverture, par son destinataire.",
          "Avec un compte : vous pouvez exporter vos données (le fichier est fait sur votre appareil), corriger votre pseudo, votre photo et votre adresse, et supprimer votre compte à tout moment depuis ses paramètres. L'empreinte de votre adresse reste une donnée personnelle : pour une demande faite par adresse ou un recours contre un bannissement, écrivez-nous (contact des mentions légales).",
        ],
      },
    ),
  }),
  conditions: (p) => ({
    ...p,
    blocks: inserer(p.blocks, "Signalement", {
      id: "compte",
      h: "Compte",
      p: [
        "Un compte gratuit sert seulement à créer des salons ; partager, ouvrir un lien et rejoindre un salon restent sans compte. Il faut avoir au moins 15 ans.",
        "Un compte qui crée des salons pour nuire peut être banni : il ne peut plus créer de salon, ses salons sont fermés, et la même adresse ne peut pas en recréer un pendant la durée du bannissement (3 ans par défaut). Le motif est montré à la connexion ; un recours est possible par le contact des mentions légales.",
        "Un compte sans connexion pendant 13 mois est effacé.",
      ],
    }),
  }),
  securite: (p) => ({
    ...p,
    blocks: inserer(p.blocks, "Ce que Shhgone ne peut pas faire", {
      id: "compte",
      h: "Ce que le compte ne protège pas",
      list: [
        "Votre boîte mail est la clé du compte : qui la lit peut le récupérer (avec la double authentification, il lui faut aussi votre application). Protégez-la bien.",
        "Le service peut lire votre profil (pseudo, photo, langue, abonnement) : c'est ce qui permet de vous le rendre après un mot de passe oublié.",
        "Qui a votre mot de passe a aussi vos liens et la gestion de vos salons et partages.",
        "Votre fournisseur d'e-mails voit que vous recevez des codes Shhgone.",
        "Notre serveur sait quels salons votre compte a créés, le temps de leur vie.",
        "Un pseudo ne prouve pas une identité : dans un salon, n'importe qui peut choisir le même.",
      ],
    }),
  }),
};

const COMPTE_EN: Partial<Record<InfoName, (p: InfoPage) => InfoPage>> = {
  confidentialite: (p) => ({
    ...p,
    lede: "No account to send, to receive or to join a room. No trackers, no audience measurement, no ads.",
    blocks: remplacer(
      inserer(p.blocks, "What we don't keep", {
        id: "compte",
        h: "If you create an account (to create rooms)",
        list: [
          "Your email address is kept only as a fingerprint (a one-way computation with a secret server key): we do not keep it in readable form. It passes through our server while a code is sent, and through our email delivery provider (name to be completed by the owner), which sees the address, the time and the code. The email holds only the code.",
          "Your password never leaves your device: the server only receives a value derived from it, and keeps only a fingerprint of that.",
          "Your nickname, photo, language and subscription are encrypted, but kept so that they can be given back if you forget your password: the service can therefore read them. Your nickname is kept only as a fingerprint, so that it stays unique.",
          "Your links, the rooms you join and the management of your rooms and shares are in a second vault, encrypted by your password only: we cannot read them. After a forgotten password, this vault is lost, except what is still on one of your devices.",
          "We know which rooms your account created, for as long as they live, so that an account that does harm can be banned; never which shares.",
          "Dates kept to the day (creation, seniority), last sign-in to the month: no time of day, no IP address, no readable device name.",
          "Reports: only their category, counted in memory. A ban keeps the fingerprint of the address, its length (3 years by default) and its category, shown to the person; an appeal is possible.",
          "After a recovery by email, the address cannot be changed and the account cannot be deleted for 7 days, for safety.",
          "The accounts database is backed up every day, encrypted, with another host; each copy is erased after 30 days. A deleted account can therefore remain in these copies for up to 30 days.",
          "With no sign-in for 13 months, the account is erased. We cannot warn you: we do not have your address.",
        ],
      }),
      "Your rights",
      {
        h: "Your rights",
        p: [
          "Without an account, we do not know who you are: there is no personal data to give back or correct. A share can be destroyed at any time by its sender (management link) or, at the last open, by its recipient.",
          "With an account: you can export your data (the file is made on your device), correct your nickname, photo and address, and delete your account at any time from its settings. The fingerprint of your address is still personal data: for a request made by address or an appeal against a ban, write to us (contact in the legal notice).",
        ],
      },
    ),
  }),
  conditions: (p) => ({
    ...p,
    blocks: inserer(p.blocks, "Reporting", {
      id: "compte",
      h: "Account",
      p: [
        "A free account is only used to create rooms; sharing, opening a link and joining a room need no account. You must be at least 15.",
        "An account that creates rooms to do harm can be banned: it can no longer create rooms, its rooms are closed, and the same address cannot create another one for the length of the ban (3 years by default). The reason is shown at sign-in; an appeal is possible through the contact in the legal notice.",
        "An account with no sign-in for 13 months is erased.",
      ],
    }),
  }),
  securite: (p) => ({
    ...p,
    blocks: inserer(p.blocks, "What Shhgone cannot do", {
      id: "compte",
      h: "What the account does not protect",
      list: [
        "Your mailbox is the key to the account: whoever reads it can recover it (with two-factor authentication, they also need your app). Protect it well.",
        "The service can read your profile (nickname, photo, language, subscription): that is what lets it give it back after a forgotten password.",
        "Whoever has your password also has your links and the management of your rooms and shares.",
        "Your email provider sees that you receive Shhgone codes.",
        "Our server knows which rooms your account created, for as long as they live.",
        "A nickname does not prove an identity: in a room, anyone can pick the same one.",
      ],
    }),
  }),
};
