/* Une lettre pour toi : espace admin (Supabase) + surprise à code. */
const $ = id => document.getElementById(id);
const CFG = window.SURPRISE_CONFIG || {};
const BUCKET = "photos";

/* ---------- décor ---------- */
const LIPS = '<svg viewBox="0 0 40 24" fill="currentColor"><path d="M2 11C7 3 14 1 20 6C26 1 33 3 38 11C33 12 26 13 20 12C14 13 7 12 2 11Z"/><path d="M2 12C8 14 14 14 20 13C26 14 32 14 38 12C33 21 26 23 20 23C14 23 7 21 2 12Z" opacity=".85"/></svg>';
const HEART = '<svg viewBox="0 0 24 22" fill="currentColor"><path d="M12 21C5 16 0 12 0 6.5 0 3 2.7 0 6.2 0 8.6 0 10.6 1.3 12 3.3 13.4 1.3 15.4 0 17.8 0 21.3 0 24 3 24 6.5 24 12 19 16 12 21Z"/></svg>';
document.querySelectorAll(".lips").forEach(l => l.innerHTML = LIPS);
$("eHeart").innerHTML = HEART;
for (let i = 0; i < 14; i++) {
  const c = document.createElement("i");
  c.style.left = (5 + (i * 37) % 90) + "%"; c.style.top = (6 + (i * 53) % 88) + "%";
  $("crosses").appendChild(c);
}

function show(viewId) {
  document.querySelectorAll(".view").forEach(v => v.hidden = v.id !== viewId);
  window.scrollTo(0, 0);
}

/* ---------- Supabase ---------- */
const configured = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("TON-PROJET") && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes("COLLE-ICI");
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
const FUNCTION_URL = configured ? CFG.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/open-surprise" : "";
const SIGNED_PREFIX = configured ? CFG.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/sign/" + BUCKET + "/" : "";
const linkFor = slug => location.origin + location.pathname + "?s=" + encodeURIComponent(slug);

// Les photos sont privées : on n'affiche que des liens temporaires signés par Supabase,
// ou des aperçus locaux (blob:/data:). Jamais une adresse quelconque venant de la base.
const signedCache = new Map();   // chemin dans le stockage -> lien temporaire (espace admin)
function photoUrl(p) {
  if (!p) return "";
  if (/^(blob:|data:)/.test(p)) return p;
  if (SIGNED_PREFIX && p.startsWith(SIGNED_PREFIX)) return p;   // lien déjà signé (surprise ouverte)
  return signedCache.get(p) || "";
}
async function signPaths(paths) {
  const missing = [...new Set(paths.filter(p => p && !signedCache.has(p) && !/^(blob:|data:)/.test(p)))];
  if (!missing.length) return;
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(missing, 3600);
  (data || []).forEach(d => { if (d.signedUrl && d.path) signedCache.set(d.path, d.signedUrl); });
}

/* =====================================================================
   ÉMOJIS DANS L'ÉCRITURE MANUSCRITE
   ===================================================================== */
// Retire le sélecteur « émoji en couleur » (U+FE0F) : les émojis prennent alors le style trait + couleur de l'encre.
const ink = s => (s || "").replace(/\uFE0F/g, "");
// Séquences composées (👩‍❤️‍👨, ❤️‍🔥…) : on les laisse telles quelles, sans les découper.
const ZWJ_SEQ = /((?:\p{Extended_Pictographic}[\uFE0F\u{1F3FB}-\u{1F3FF}]?\u200D)+\p{Extended_Pictographic}[\uFE0F\u{1F3FB}-\u{1F3FF}]?)/u;
// Émojis cœur : cœur plein de la couleur du texte (comme ♥).
const HEART_EMOJI = /(\u2764|\u2665|\u2763|\u{1F495}|\u{1F496}|\u{1F497}|\u{1F493}|\u{1F49E}|\u{1F498}|\u{1F49D}|\u{1F49F}|\u{1F9E1}|\u{1F49B}|\u{1F49A}|\u{1F499}|\u{1F49C}|\u{1F5A4}|\u{1F90D}|\u{1F90E}|\u{1FA77}|\u{1FA75}|\u{1FA76})/u;
// Visages : plein couleur encre, avec les traits (yeux, bouche…) découpés en creux.
const FACE_EMOJI = /([\u{1F600}-\u{1F64F}\u{1F910}-\u{1F92F}\u{1F970}-\u{1F97A}\u{1F9D0}\u{1FAE0}-\u{1FAE8}\u2639\u263A][\u{1F3FB}-\u{1F3FF}]?)/u;
// Les dessins des visages (Twemoji, CC BY 4.0) sont copiés dans le site : aucune requête vers un tiers.
const faceMasks = new Map();
function faceMask(emoji) {
  if (faceMasks.has(emoji)) return faceMasks.get(emoji);
  const code = [...emoji].map(c => c.codePointAt(0).toString(16)).join("-");
  const p = new Promise(resolve => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const S = 128, c = document.createElement("canvas"); c.width = c.height = S;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, S, S);
        const data = g.getImageData(0, 0, S, S), d = data.data;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3]; if (!a) continue;
          const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
          const red = d[i] > 150 && d[i] - d[i + 1] > 70 && d[i] - d[i + 2] > 50;   // cœurs, bisous
          const keep = red ? 0.38 : Math.min(1, Math.max(0, (lum - 0.45) / 0.15)); // clair = plein, sombre = creux, rouge = teinte claire
          d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = Math.round(a * keep);
        }
        g.putImageData(data, 0, 0);
        resolve(c.toDataURL());
      } catch { resolve(null); }
    };
    img.src = "twemoji/" + code + ".svg";
  });
  faceMasks.set(emoji, p);
  return p;
}
function appendFaces(el, text) {
  text.split(FACE_EMOJI).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 0) { el.appendChild(document.createTextNode(part)); return; }
    // en attendant le dessin (ou s'il n'existe pas) : l'émoji au trait
    const f = document.createElement("span"); f.className = "ink-face pending"; f.textContent = part;
    f.setAttribute("role", "img"); f.setAttribute("aria-label", part);
    el.appendChild(f);
    faceMask(part).then(url => {
      if (!url) return;
      f.textContent = ""; f.style.setProperty("--m", `url("${url}")`); f.classList.remove("pending");
    });
  });
}
function appendHearts(el, text) {
  ink(text).split(HEART_EMOJI).forEach((part, i) => {
    if (i % 2 === 0) { if (part) appendFaces(el, part); return; }
    const h = document.createElement("span"); h.className = "ink-heart"; h.setAttribute("aria-label", "cœur"); h.innerHTML = HEART;
    el.appendChild(h);
  });
}
function inkInto(el, text) {
  el.textContent = "";
  (text || "").split(ZWJ_SEQ).forEach((part, i) => {
    if (!part) return;
    if (i % 2) el.appendChild(document.createTextNode(part));   // séquence composée : intacte
    else appendHearts(el, part);
  });
}

/* =====================================================================
   LA SURPRISE (côté personne qui reçoit le lien)
   ===================================================================== */
let S = null;           // surprise affichée : { indice, debut, statut, titre, texte, signature, legendes, photos }
let unlocked = false;
let slug = null;
let entry = "", opened = false, checking = false;
let CODE_LEN = 6;
let lockIndice = "", lockReady = false, lockTimer = null;

// Appel de la fonction serveur : elle seule vérifie le code et signe les photos.
async function callSurprise(body) {
  try {
    const r = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    });
    if (!r.ok && r.status !== 400) return { status: "error" };
    return await r.json();
  } catch { return { status: "error" }; }
}

function fillPhoto(el, i) {
  const list = S && S.photos ? S.photos : [];
  const src = list.length ? photoUrl(list[i % list.length]) : "";
  el.style.backgroundImage = src ? `url("${src}")` : "";
  el.style.setProperty("--img", src ? `url("${src}")` : "none");
  el.classList.toggle("has-img", !!src);
  el.textContent = src ? "" : "♥";
}
function renderLockPhotos(heartPhotos) {
  const keep = S; S = { photos: heartPhotos || [] };
  const h = $("heartGrid"); h.innerHTML = ""; h.className = "heart photo";
  fillPhoto(h, 0);
  S = keep;
}
function renderUnlocked() {
  document.querySelectorAll("[data-photo]").forEach(el => fillPhoto(el, +el.dataset.photo));
  inkInto($("status"), S.statut);
  const start = S.debut ? new Date(S.debut + "T00:00:00") : null;
  const ok = start && !isNaN(start);
  $("days").textContent = ok ? Math.max(0, Math.floor((Date.now() - start) / 864e5)).toLocaleString("fr-FR") : "—";
  $("since").textContent = ok ? start.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : "—";
  inkInto($("pTitle"), S.titre);
  inkInto($("pSign"), S.signature);
  $("pBody").innerHTML = "";
  (S.texte || []).forEach(t => { const p = document.createElement("p"); inkInto(p, t); $("pBody").appendChild(p); });
}

function closeLetter() {
  opened = false;
  $("env").classList.remove("open"); $("paper").classList.remove("show");
  $("readTitle").textContent = "Read Me! Read Me! Read Me, pls!"; $("readBtn").textContent = "♥ Read Me";
}
$("readBtn").addEventListener("click", () => {
  if (opened) return closeLetter();
  opened = true;
  $("env").classList.add("open"); $("paper").classList.add("show");
  $("readTitle").textContent = "Yayyyy!!"; $("readBtn").textContent = "♥ Close Me";
});

function printPhotos() {
  const strip = $("strip"); strip.innerHTML = "";
  if (!S) return;
  const n = S.photos.length || 3;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div"); p.className = "polaroid"; p.style.animationDelay = (i * .7) + "s";
    const ph = document.createElement("div"); ph.className = "photo"; fillPhoto(ph, i);
    const cap = document.createElement("span"); inkInto(cap, S.legendes && S.legendes[i]);
    p.append(ph, cap); strip.appendChild(p);
  }
}

function go(id) {
  if (id !== "s-lock" && !unlocked) return;
  document.querySelectorAll(".screen").forEach(s => s.hidden = s.id !== id);
  document.querySelectorAll("[data-go]").forEach(b => b.classList.toggle("on", b.dataset.go === id));
  $("nav").hidden = id === "s-lock";
  if (id === "s-mem") printPhotos();
}
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

function resetHint() {
  $("hintBtn").setAttribute("aria-expanded", "false");
  $("hintBtn").textContent = "Indice ?";
  $("hint").textContent = ""; $("hint").classList.remove("bubble-hint");
}
// Verrouiller = tout effacer de la page : il faudra redemander le code au serveur.
function relock() {
  unlocked = false; S = null; entry = "";
  closeLetter(); resetHint();
  ["pTitle", "pBody", "pSign", "status", "strip"].forEach(id => $(id).textContent = "");
  $("days").textContent = "0"; $("since").textContent = "—";
  document.querySelectorAll("[data-photo]").forEach(el => {
    el.style.backgroundImage = ""; el.style.setProperty("--img", "none"); el.classList.remove("has-img"); el.textContent = "♥";
  });
  drawCode(); go("s-lock");
}
$("lockBtn").addEventListener("click", relock);

function drawCode() {
  $("code").innerHTML = entry ? "" : "🔒 Entre le code";
  if (entry) for (let i = 0; i < CODE_LEN; i++) { const d = document.createElement("span"); d.className = "dot" + (i < entry.length ? " full" : ""); $("code").appendChild(d); }
}
$("hintBtn").addEventListener("click", () => {
  const open = $("hintBtn").getAttribute("aria-expanded") !== "true";
  if (!open) return resetHint();
  $("hintBtn").setAttribute("aria-expanded", "true");
  $("hintBtn").textContent = "Cacher l'indice";
  inkInto($("hint"), lockIndice); $("hint").classList.add("bubble-hint");
});

// Trop d'essais : clavier en pause, avec le temps restant.
function startPause(seconds) {
  clearInterval(lockTimer);
  const until = Date.now() + seconds * 1000;
  document.querySelectorAll(".key").forEach(k => k.disabled = true);
  const tick = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(lockTimer);
      document.querySelectorAll(".key").forEach(k => k.disabled = false);
      $("codeMsg").textContent = "Tu peux réessayer ♥";
      return;
    }
    const min = Math.ceil(left / 60);
    $("codeMsg").textContent = left >= 3600
      ? `Trop d'essais. Réessaie dans ${Math.ceil(left / 3600)} h.`
      : `Trop d'essais. Réessaie dans ${min} minute${min > 1 ? "s" : ""}.`;
  };
  tick(); lockTimer = setInterval(tick, 15000);
}

async function press(k) {
  if (!lockReady || checking) return;
  if (k === "C") entry = "";
  else if (k === "⌫") entry = entry.slice(0, -1);
  else if (entry.length < CODE_LEN) entry += k;
  drawCode();
  if (entry.length !== CODE_LEN) return;
  checking = true;
  const data = await callSurprise({ action: "open", slug, code: entry });
  checking = false;
  if (data.status === "ok") {
    S = Object.assign({ photos: [], legendes: [], texte: [] }, data);
    unlocked = true; entry = ""; $("codeMsg").textContent = ""; renderUnlocked();
    return setTimeout(() => go("s-profile"), 200);
  }
  if (data.status === "wrong") {
    wrongCode();
    $("codeMsg").textContent = data.remaining > 0
      ? `Code incorrect. Encore ${data.remaining} essai${data.remaining > 1 ? "s" : ""} avant une pause.`
      : "Code incorrect.";
    return;
  }
  entry = ""; drawCode();
  if (data.status === "locked") return startPause(data.retry_after || 900);
  if (data.status === "not_found") { lockReady = false; $("codeMsg").textContent = "Cette surprise n'existe plus."; return; }
  $("codeMsg").textContent = "Le service ne répond pas pour l'instant. Réessaie dans une minute.";
}
function wrongCode() {
  $("code").classList.add("shake");
  setTimeout(() => { $("code").classList.remove("shake"); entry = ""; drawCode(); }, 450);
}
["1","2","3","4","5","6","7","8","9","C","0","⌫"].forEach(k => {
  const b = document.createElement("button"); b.className = "key"; b.textContent = k; b.type = "button";
  b.setAttribute("aria-label", k === "C" ? "Effacer" : k === "⌫" ? "Retour" : k);
  b.addEventListener("click", () => press(k)); $("keys").appendChild(b);
});
addEventListener("keydown", e => {
  if ($("v-surprise").hidden || $("s-lock").hidden) return;
  if (document.querySelector(".key:disabled")) return;
  if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("⌫");
});

async function openRecipient(s) {
  slug = s; show("v-surprise");
  renderLockPhotos([]); drawCode();
  $("codeMsg").textContent = "Chargement…";
  const data = await callSurprise({ action: "preview", slug });
  if (data.status === "error") {
    $("codeMsg").textContent = "Le service ne répond pas pour l'instant (il est peut-être en train de se réveiller). Recharge la page dans une minute.";
    return;
  }
  if (data.status !== "ok") { $("codeMsg").textContent = "Ce lien ne contient pas de surprise. Demande le bon lien à la personne qui te l'a envoyé."; return; }
  lockIndice = data.indice || "";
  CODE_LEN = data.longueur || 6;
  renderLockPhotos(data.photo ? [data.photo] : []);
  $("codeMsg").textContent = "";
  $("hintBtn").hidden = !lockIndice;
  lockReady = true;
  if (data.locked_for > 0) startPause(data.locked_for);
}

/* =====================================================================
   ESPACE ADMIN
   ===================================================================== */
let me = null, mine = [], recovering = false;
const PW_MIN = 8;

/* ----- connexion ----- */
let signupMode = false;
function setAuthMode(signup) {
  signupMode = signup;
  $("tabLogin").classList.toggle("solid", !signup); $("tabSignup").classList.toggle("solid", signup);
  $("authBtn").textContent = signup ? "Créer mon compte" : "Se connecter";
  $("a-pass").autocomplete = signup ? "new-password" : "current-password";
  $("a-pass").minLength = signup ? PW_MIN : 0;   // les anciens mots de passe (6 caractères) restent acceptés à la connexion
  $("pwHelp").hidden = !signup; $("forgotBtn").hidden = signup;
  $("codeField").hidden = !signup; $("a-code").required = signup;
  $("authMsg").textContent = "";
}
document.querySelectorAll(".contact-line").forEach(el => el.textContent = CFG.CONTACT ? "Pas encore de code ? " + CFG.CONTACT : "");
$("tabLogin").addEventListener("click", () => setAuthMode(false));
$("tabSignup").addEventListener("click", () => setAuthMode(true));

function authError(err) {
  const code = err && err.code || "", m = (err && err.message || "").toLowerCase();
  const reasons = (err && err.reasons) || [];
  if (code === "invalid_credentials" || m.includes("invalid login")) return "E-mail ou mot de passe incorrect.";
  if (code === "user_already_exists" || code === "email_exists" || m.includes("already registered")) return "Un compte existe déjà avec cet e-mail. Connecte-toi.";
  if (code === "email_not_confirmed" || m.includes("not confirmed")) return "Confirme d'abord ton e-mail : clique sur le lien reçu par mail.";
  if (code === "same_password") return "Choisis un mot de passe différent de l'ancien.";
  if (code === "weak_password" || m.includes("weak password")) {
    if (reasons.includes("pwned")) return "Ce mot de passe circule dans des fuites de données. Choisis-en un autre.";
    if (reasons.includes("characters")) return "Ce mot de passe est trop simple : mélange lettres, chiffres et symboles.";
    return `Ce mot de passe est trop court : ${PW_MIN} caractères minimum.`;
  }
  if (m.includes("password should be at least")) return `Ce mot de passe est trop court : ${PW_MIN} caractères minimum.`;
  if (code.startsWith("over_") || m.includes("rate limit") || m.includes("too many")) return "Trop d'essais. Attends quelques minutes et réessaie.";
  if (code === "signup_disabled") return "Les inscriptions sont fermées pour le moment.";
  return "Ça n'a pas marché : " + (err && err.message || "erreur inconnue");
}

// Le code d'activation saisi à l'inscription est gardé le temps de la création du compte,
// rattaché à l'e-mail : un autre compte ouvert dans le même onglet ne peut pas l'utiliser.
function savePending(email, code) { try { sessionStorage.setItem("pendingCode", JSON.stringify({ email: email.toLowerCase(), code })); } catch {} }
function clearPending() { try { sessionStorage.removeItem("pendingCode"); } catch {} }
function takePending(email) {
  let p = null; try { p = JSON.parse(sessionStorage.getItem("pendingCode") || "null"); } catch {}
  clearPending();
  return p && email && p.email === email.toLowerCase() ? p.code : null;
}

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("a-email").value.trim(), password = $("a-pass").value, code = $("a-code").value.trim();
  $("authBtn").disabled = true;
  if (signupMode) {
    $("authMsg").textContent = "Vérification du code…";
    const { data: ok, error } = await sb.rpc("code_is_valid", { p_code: code });
    if (error || !ok) { $("authBtn").disabled = false; $("authMsg").textContent = error ? "Connexion impossible. Réessaie." : "Ce code d'activation n'existe pas ou a déjà servi."; return; }
    savePending(email, code);
  }
  $("authMsg").textContent = signupMode ? "Création du compte…" : "Connexion…";
  const res = signupMode
    ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
    : await sb.auth.signInWithPassword({ email, password });
  $("authBtn").disabled = false;
  if (res.error) { if (signupMode) clearPending(); $("authMsg").textContent = authError(res.error); return; }
  if (signupMode && !res.data.session) {
    // Supabase répond « succès » sans identité quand l'e-mail est déjà pris (confirmation activée).
    if (res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) {
      clearPending();
      $("authMsg").textContent = "Un compte existe peut-être déjà avec cet e-mail : essaie de te connecter.";
      setAuthMode(false); return;
    }
    $("authMsg").textContent = "Compte créé ! Clique sur le lien de confirmation reçu par e-mail, puis reviens te connecter. Tu entreras ton code d'activation à ce moment-là.";
    setAuthMode(false); return;
  }
});

/* ----- après connexion : propriétaire, client activé, ou activation à faire ----- */
let isOwner = false, routing = false;
async function route() {
  if (routing) return; routing = true;
  try {
    const { data, error } = await sb.rpc("my_status");
    if (error) { show("v-auth"); $("authMsg").textContent = "Connexion impossible. Recharge la page."; return; }
    isOwner = !!data.owner;
    const pending = takePending(me && me.email);
    if (data.member) return openDash();
    openActivate(data.inactive);
    if (pending && !data.inactive) { $("act-code").value = pending; activate(); }
  } finally { routing = false; }
}
function openActivate(disabled) {
  show("v-activate");
  $("actEmail").textContent = me ? "Connecté : " + me.email : "";
  $("actIntro").textContent = disabled
    ? "Ce compte a été désactivé. Contacte le propriétaire du site pour le réactiver."
    : "Ton compte est créé, il reste à l'activer. Entre le code d'activation qu'on t'a donné.";
  $("act-code").disabled = $("actBtn").disabled = !!disabled;
  $("actMsg").textContent = "";
}
async function activate() {
  $("actBtn").disabled = true; $("actMsg").textContent = "Activation…";
  const { data, error } = await sb.rpc("activate_account", { p_code: $("act-code").value });
  $("actBtn").disabled = false;
  if (error) { $("actMsg").textContent = "Connexion impossible. Réessaie."; return; }
  if (data === "ok" || data === "already") return openDash("Compte activé ! Tu peux créer ta première surprise.");
  $("actMsg").textContent = {
    invalid: "Ce code n'existe pas ou a déjà servi. Vérifie-le (tirets compris).",
    disabled: "Ce compte a été désactivé. Contacte le propriétaire du site.",
    signed_out: "Tu as été déconnecté. Reconnecte-toi."
  }[data] || "L'activation a échoué. Réessaie.";
}
$("activateForm").addEventListener("submit", e => { e.preventDefault(); activate(); });
$("actLogout").addEventListener("click", () => sb.auth.signOut());
$("forgotBtn").addEventListener("click", async () => {
  const email = $("a-email").value.trim();
  if (!email) { $("authMsg").textContent = "Écris d'abord ton e-mail, puis clique sur « Mot de passe oublié »."; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $("authMsg").textContent = error ? authError(error) : "Si un compte existe, un e-mail pour changer le mot de passe vient d'être envoyé.";
});
$("resetForm").addEventListener("submit", async e => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $("r-pass").value });
  if (error) { $("resetMsg").textContent = authError(error); return; }
  recovering = false; route();
});
$("logoutBtn").addEventListener("click", () => sb.auth.signOut());

/* ----- effacer des photos du stockage ----- */
// Renvoie true si tout a été effacé. Une erreur est signalée ; le propriétaire pourra nettoyer plus tard.
async function removePhotos(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) return false;
  }
  return true;
}
async function listFolder(userId) {
  const { data, error } = await sb.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (error) throw error;
  return (data || []).filter(o => o.name).map(o => `${userId}/${o.name}`);
}

/* ----- liste ----- */
async function openDash(msg) {
  show("v-dash");
  $("whoEmail").textContent = me ? "Connecté : " + me.email : "";
  $("ownerBtn").hidden = !isOwner;
  $("delAccountBtn").hidden = isOwner;
  $("delAccountMsg").textContent = "";
  $("dashMsg").textContent = msg || "Chargement…";
  const { data, error } = await sb.from("surprises").select("*").order("created_at", { ascending: false });
  if (error) { $("dashMsg").textContent = "Impossible de charger tes surprises. Recharge la page."; return; }
  if (!data.length && !isOwner) { // compte désactivé entre-temps ? on revérifie
    const st = await sb.rpc("my_status");
    if (st.data && !st.data.member) return openActivate(st.data.inactive);
  }
  mine = data;
  await signPaths(mine.map(s => s.photos[1] || s.photos[0]));
  drawList(); $("dashMsg").textContent = msg || "";
}
function drawList(freshId) {
  const list = $("list"); list.innerHTML = "";
  if (!mine.length) {
    const e = document.createElement("div"); e.className = "empty";
    e.textContent = "Aucune surprise pour l'instant. Crée la première avec le bouton ci-dessous.";
    list.appendChild(e); return;
  }
  mine.forEach(s => {
    const item = document.createElement("div"); item.className = "item" + (s.id === freshId ? " fresh" : "");
    const pic = document.createElement("div"); pic.className = "pic photo";
    const src = photoUrl(s.photos[1] || s.photos[0]);
    if (src) { pic.style.backgroundImage = `url("${src}")`; pic.classList.add("has-img"); } else pic.textContent = "♥";
    const main = document.createElement("div"); main.className = "item-main";
    const name = document.createElement("div"); name.className = "item-name"; name.textContent = s.nom;
    // Le code reste masqué tant qu'on ne demande pas à le voir.
    const meta = document.createElement("div"); meta.className = "item-meta";
    const codeTxt = document.createElement("span"); codeTxt.textContent = "••••••";
    const codeBtn = document.createElement("button"); codeBtn.type = "button"; codeBtn.className = "linkbtn mini"; codeBtn.textContent = "afficher";
    codeBtn.setAttribute("aria-label", "Afficher le code de la surprise pour " + s.nom);
    codeBtn.onclick = () => {
      const shown = codeTxt.textContent !== "••••••";
      codeTxt.textContent = shown ? "••••••" : s.code; codeBtn.textContent = shown ? "afficher" : "masquer";
    };
    meta.append(`${s.photos.length} photo${s.photos.length > 1 ? "s" : ""} · code `, codeTxt, " ", codeBtn,
      ` · créée le ${new Date(s.created_at).toLocaleDateString("fr-FR")}`);
    const row = document.createElement("div"); row.className = "linkrow";
    const inp = document.createElement("input"); inp.type = "text"; inp.readOnly = true; inp.value = linkFor(s.slug); inp.id = "link-" + s.id;
    inp.setAttribute("aria-label", "Lien de la surprise pour " + s.nom);
    inp.addEventListener("focus", () => inp.select());
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "pill solid"; copy.textContent = "Copier";
    copy.onclick = async () => {
      inp.focus(); inp.select();
      try { await navigator.clipboard.writeText(inp.value); copy.textContent = "Copié ✓"; }
      catch { copy.textContent = "Ctrl+C"; $("dashMsg").textContent = "Le lien est sélectionné : copie-le avec Ctrl+C (ou appui long sur téléphone)."; }
      setTimeout(() => copy.textContent = "Copier", 2000);
    };
    row.append(inp, copy);
    const acts = document.createElement("div"); acts.className = "item-actions";
    const view = document.createElement("a"); view.className = "pill"; view.textContent = "Voir"; view.href = linkFor(s.slug); view.target = "_blank"; view.rel = "noopener";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "pill"; edit.textContent = "✎ Modifier";
    edit.onclick = () => openForm(s);
    const del = document.createElement("button"); del.type = "button"; del.className = "pill danger"; del.textContent = "Supprimer";
    del.onclick = async () => {
      if (!del.dataset.armed) {
        del.dataset.armed = "1"; del.textContent = "Confirmer la suppression";
        setTimeout(() => { delete del.dataset.armed; del.textContent = "Supprimer"; }, 4000); return;
      }
      del.disabled = true;
      const { error } = await sb.from("surprises").delete().eq("id", s.id);
      if (error) { del.disabled = false; $("dashMsg").textContent = "La suppression a échoué. Réessaie."; return; }
      const gone = s.photos.length ? await removePhotos(s.photos) : true;
      mine = mine.filter(x => x.id !== s.id); drawList();
      $("dashMsg").textContent = gone
        ? `Surprise pour ${s.nom} supprimée.`
        : `Surprise pour ${s.nom} supprimée, mais ses photos n'ont pas pu être effacées du stockage. Elles seront retirées lors du prochain nettoyage.`;
    };
    const qrBtn = document.createElement("button"); qrBtn.type = "button"; qrBtn.className = "pill"; qrBtn.textContent = "▦ QR code";
    const qrBox = document.createElement("div"); qrBox.className = "qrbox"; qrBox.hidden = true;
    qrBtn.onclick = () => {
      qrBox.hidden = !qrBox.hidden;
      qrBtn.classList.toggle("on", !qrBox.hidden);
      if (!qrBox.hidden && !qrBox.firstChild) buildQr(qrBox, s);
    };
    acts.append(view, qrBtn, edit, del);
    main.append(name, meta, row, acts, qrBox);
    // Ancien format de lien (avec le prénom) : on propose d'en créer un nouveau, entièrement aléatoire.
    if (s.slug.includes("-")) {
      const old = document.createElement("div"); old.className = "oldlink";
      const txt = document.createElement("span"); txt.textContent = "Ce lien contient le prénom. Un nouveau lien le retire, mais l'ancien lien et son QR code cesseront de marcher.";
      const regen = armedButton("↻ Nouveau lien", "Confirmer", "", async () => {
        const slugNew = makeSlug();
        const { error } = await sb.from("surprises").update({ slug: slugNew }).eq("id", s.id);
        if (error) { $("dashMsg").textContent = "Le nouveau lien n'a pas pu être créé. Réessaie."; return; }
        s.slug = slugNew; drawList(s.id);
        $("dashMsg").textContent = `Nouveau lien créé pour ${s.nom}. Envoie-le (ou son nouveau QR code) : l'ancien ne marche plus.`;
      });
      old.append(txt, regen);
      main.insertBefore(old, acts);
    }
    item.append(pic, main); list.appendChild(item);
  });
}
$("newBtn").addEventListener("click", () => openForm(null));

/* ----- supprimer son propre compte ----- */
$("delAccountBtn").addEventListener("click", async () => {
  const b = $("delAccountBtn");
  if (!b.dataset.armed) {
    b.dataset.armed = "1"; b.textContent = "Tout sera effacé (surprises, photos, compte). Clique encore pour confirmer.";
    setTimeout(() => { delete b.dataset.armed; b.textContent = "Supprimer mon compte et mes données"; }, 6000); return;
  }
  b.disabled = true; $("delAccountMsg").textContent = "Suppression…";
  try {
    const paths = await listFolder(me.id);
    if (paths.length && !(await removePhotos(paths))) throw new Error("photos");
    const { error } = await sb.rpc("delete_my_account");
    if (error) throw error;
    await sb.auth.signOut();
    // après le retour à l'écran de connexion (qui efface les messages)
    setTimeout(() => { $("authMsg").textContent = "Ton compte et toutes tes données ont été supprimés."; }, 100);
  } catch {
    b.disabled = false;
    $("delAccountMsg").textContent = "La suppression a échoué. Réessaie, ou contacte le propriétaire du site.";
  }
});

/* ----- QR code : une petite carte rose à imprimer ou envoyer ----- */
function drawQrCard(url) {
  const qr = qrcode(0, "H"); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), cell = Math.floor(560 / n), size = cell * n;
  const W = size + 160, H = size + 300;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#e07a9c"; g.fillRect(0, 0, W, H);                                 // carte rose
  const ox = 80, oy = 120;
  g.fillStyle = "#fffafb"; roundRect(g, ox - 30, oy - 30, size + 60, size + 60, 28); g.fill();
  g.fillStyle = "#b0123c";
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++)
    if (qr.isDark(r, col)) g.fillRect(ox + col * cell, oy + r * cell, cell, cell);
  // cœur au centre (le QR reste lisible grâce à la correction d'erreur "H")
  const hs = size * 0.2, hx = ox + size / 2, hy = oy + size / 2;
  g.fillStyle = "#fffafb"; roundRect(g, hx - hs * .62, hy - hs * .58, hs * 1.24, hs * 1.16, 14); g.fill();
  g.fillStyle = "#b0123c"; heartPath(g, hx, hy + hs * .04, hs * .9); g.fill();
  g.fillStyle = "#fffafb"; g.textAlign = "center";
  g.font = "600 46px Fredoka, 'Trebuchet MS', sans-serif"; g.fillText("Scanne-moi ♥", W / 2, 76);
  g.font = "600 30px Nunito, 'Segoe UI', sans-serif"; g.fillText("Une surprise t'attend…", W / 2, oy + size + 100);
  g.font = "26px Nunito, 'Segoe UI', sans-serif"; g.fillText("Ouvre l'appareil photo et vise le code", W / 2, oy + size + 146);
  return c;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function heartPath(g, cx, cy, w) {
  const s = w / 24, x = cx - 12 * s, y = cy - 11 * s;
  g.beginPath(); g.moveTo(x + 12 * s, y + 21 * s);
  g.bezierCurveTo(x + 5 * s, y + 16 * s, x, y + 12 * s, x, y + 6.5 * s);
  g.bezierCurveTo(x, y + 3 * s, x + 2.7 * s, y, x + 6.2 * s, y);
  g.bezierCurveTo(x + 8.6 * s, y, x + 10.6 * s, y + 1.3 * s, x + 12 * s, y + 3.3 * s);
  g.bezierCurveTo(x + 13.4 * s, y + 1.3 * s, x + 15.4 * s, y, x + 17.8 * s, y);
  g.bezierCurveTo(x + 21.3 * s, y, x + 24 * s, y + 3 * s, x + 24 * s, y + 6.5 * s);
  g.bezierCurveTo(x + 24 * s, y + 12 * s, x + 19 * s, y + 16 * s, x + 12 * s, y + 21 * s);
  g.closePath();
}
const plainName = nom => (nom || "").normalize("NFD").replace(/[\u0300-\u036F]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "surprise";
function buildQr(box, s) {
  if (typeof qrcode !== "function") { box.textContent = "Le QR code n'a pas pu se charger. Recharge la page."; return; }
  const card = drawQrCard(linkFor(s.slug));
  const img = document.createElement("img"); img.src = card.toDataURL("image/png"); img.alt = "QR code de la surprise pour " + s.nom; img.className = "qrimg";
  const fname = "surprise-" + plainName(s.nom) + ".png";
  const dl = document.createElement("a"); dl.className = "pill solid"; dl.textContent = "Télécharger l'image"; dl.href = img.src; dl.download = fname;
  const btns = document.createElement("div"); btns.className = "item-actions"; btns.appendChild(dl);
  card.toBlob(blob => {
    const file = blob && new File([blob], fname, { type: "image/png" });
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      const sh = document.createElement("button"); sh.type = "button"; sh.className = "pill solid"; sh.textContent = "Envoyer…";
      sh.onclick = () => navigator.share({ files: [file], title: "Une surprise pour toi" }).catch(() => {});
      btns.appendChild(sh);
    }
  }, "image/png");
  const tip = document.createElement("small"); tip.className = "qrtip";
  tip.textContent = "Imprime-la, glisse-la dans une carte ou un cadeau, ou envoie l'image. Elle ouvre la même surprise que le lien.";
  box.append(img, btns, tip);
}

/* ----- formulaire ----- */
const DEFAULTS = {
  nom: "", code: "", indice: "", debut: "", statut: "Coucou toi, ça va ? ♥",
  titre: "Pour toi, mon amour", signature: "— Moi ♥", photos: [],
  legendes: [],
  texte: ["Si tu lis ça, c'est que tu as trouvé le code. Je savais que tu t'en souviendrais.",
          "Merci pour chaque fou rire, chaque message du soir et chaque moment où tu m'as fait me sentir chez moi.",
          "Je t'aime plus que ce petit écran ne peut le contenir."]
};
let editing = null;   // ligne en cours de modification (null = nouvelle)
let draft = [];       // [{ path }] photo déjà en ligne, ou [{ blob, url }] nouvelle photo

async function openForm(s) {
  editing = s;
  const c = s || DEFAULTS;
  draft.forEach(d => d.url && URL.revokeObjectURL(d.url));
  draft = c.photos.map((path, i) => ({ path, cap: c.legendes[i] || "" }));
  $("f-name").value = c.nom; $("f-code").value = c.code; $("f-date").value = c.debut || "";
  $("f-hint").value = c.indice; $("f-status").value = c.statut; $("f-title").value = c.titre;
  $("f-text").value = c.texte.join("\n\n"); $("f-sign").value = c.signature;
  $("formMsg").textContent = ""; $("saveBtn").disabled = false;
  await signPaths(c.photos);
  drawThumbs(); show("v-form");
}
$("backBtn").addEventListener("click", () => openDash());
$("formClose").addEventListener("click", () => openDash());

const LABELS = ["bannière", "profil", "cœur"];
function drawThumbs() {
  const box = $("thumbs"); box.innerHTML = "";
  draft.forEach((d, i) => {
    const cellEl = document.createElement("div"); cellEl.className = "tcell";
    const t = document.createElement("div"); t.className = "thumb";
    t.style.backgroundImage = `url("${d.url || photoUrl(d.path)}")`;
    const tag = document.createElement("b"); tag.textContent = (i + 1) + (LABELS[i] ? " · " + LABELS[i] : ""); t.appendChild(tag);
    const cap = document.createElement("input"); cap.type = "text"; cap.className = "tcap"; cap.maxLength = 30;
    cap.id = "cap-" + i; cap.value = d.cap || ""; cap.placeholder = "Légende…";
    cap.setAttribute("aria-label", "Légende de la photo " + (i + 1));
    // Aperçu exact (cœurs et visages pleins) affiché par-dessus le champ quand on n'écrit pas dedans.
    const view = document.createElement("span"); view.className = "tcap-view"; view.setAttribute("aria-hidden", "true");
    const refresh = () => inkInto(view, cap.value);
    cap.addEventListener("input", () => {
      if (cap.value.includes("\uFE0F")) {
        // On retire les U+FE0F sans faire sauter le curseur à la fin.
        const v = cap.value, s0 = cap.selectionStart, s1 = cap.selectionEnd;
        const before = n => (v.slice(0, n).match(/\uFE0F/g) || []).length;
        cap.value = ink(v);
        cap.setSelectionRange(s0 - before(s0), s1 - before(s1));
      }
      d.cap = cap.value; refresh();
    });
    refresh();
    const capWrap = document.createElement("div"); capWrap.className = "tcap-wrap"; capWrap.append(cap, view);
    const tools = document.createElement("div"); tools.className = "tools";
    if (i > 0) {
      const l = document.createElement("button"); l.type = "button"; l.textContent = "←"; l.setAttribute("aria-label", "Avancer la photo " + (i + 1));
      l.onclick = () => { [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]]; drawThumbs(); }; tools.appendChild(l);
    }
    if (i < draft.length - 1) {
      const r = document.createElement("button"); r.type = "button"; r.textContent = "→"; r.setAttribute("aria-label", "Reculer la photo " + (i + 1));
      r.onclick = () => { [draft[i], draft[i + 1]] = [draft[i + 1], draft[i]]; drawThumbs(); }; tools.appendChild(r);
    }
    const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Retirer la photo " + (i + 1));
    x.onclick = () => { if (d.url) URL.revokeObjectURL(d.url); draft.splice(i, 1); drawThumbs(); }; tools.appendChild(x);
    t.appendChild(tools); cellEl.append(t, capWrap); box.appendChild(cellEl);
  });
  if (draft.length < 12) {
    const add = document.createElement("label"); add.className = "addphoto";
    add.innerHTML = '<span>+ Ajouter<br>des photos</span><input type="file" id="f-photos" accept="image/*" multiple>';
    add.querySelector("input").addEventListener("change", onFiles); box.appendChild(add);
  }
}
async function shrink(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = src; await img.decode();
    const s = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok, ko) => c.toBlob(b => b ? ok(b) : ko(new Error("toBlob")), "image/jpeg", .85));
  } finally { URL.revokeObjectURL(src); }
}
async function onFiles(e) {
  const files = [...e.target.files].slice(0, 12 - draft.length);
  let failed = 0;
  $("formMsg").textContent = "Préparation des photos…";
  for (const f of files) {
    try { const blob = await shrink(f); draft.push({ blob, url: URL.createObjectURL(blob), cap: "" }); } catch { failed++; }
  }
  $("formMsg").textContent = failed ? `${failed} photo(s) n'ont pas pu être lues. Utilise des JPG ou PNG (les photos HEIC d'iPhone ne passent pas toujours).` : "";
  drawThumbs();
}

function randomPart(n) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789", a = crypto.getRandomValues(new Uint8Array(n));
  return [...a].map(x => abc[x % abc.length]).join("");
}
// Lien entièrement aléatoire : le prénom n'apparaît plus dans l'adresse (les anciens liens restent valables).
const makeSlug = () => randomPart(14);

$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const row = {
    nom: $("f-name").value.trim(),
    code: $("f-code").value.trim(),
    debut: $("f-date").value || null,
    indice: $("f-hint").value.trim(),
    statut: $("f-status").value.trim(),
    titre: $("f-title").value.trim(),
    texte: $("f-text").value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
    signature: $("f-sign").value.trim(),
    legendes: []
  };
  if (!row.nom) { $("formMsg").textContent = "Indique pour qui est la surprise."; return; }
  if (!/^[0-9]{6}$/.test(row.code)) { $("formMsg").textContent = "Le code doit faire exactement 6 chiffres."; return; }
  if (!row.debut) { $("formMsg").textContent = "Indique le jour où vous êtes ensemble."; return; }

  $("saveBtn").disabled = true;
  try {
    // 1. envoyer les nouvelles photos
    const fresh = draft.filter(d => d.blob);
    let done = 0;
    for (const d of fresh) {
      $("formMsg").textContent = `Envoi des photos… ${done + 1}/${fresh.length}`;
      const path = `${me.id}/${randomPart(16)}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(path, d.blob, { contentType: "image/jpeg", cacheControl: "3600" });
      if (error) throw new Error("upload");
      signedCache.set(path, d.url);   // l'aperçu local sert de miniature
      d.path = path; delete d.blob; done++;
    }
    row.photos = draft.map(d => d.path);
    row.legendes = draft.map(d => (d.cap || "").trim());
    $("formMsg").textContent = "Enregistrement…";

    // 2. enregistrer la surprise
    let saved, photosLeft = true;
    if (editing) {
      const { data, error } = await sb.from("surprises").update(row).eq("id", editing.id).select().single();
      if (error) throw error; saved = data;
      const removed = editing.photos.filter(p => !row.photos.includes(p));
      if (removed.length) photosLeft = await removePhotos(removed);
    } else {
      row.slug = makeSlug();
      const { data, error } = await sb.from("surprises").insert(row).select().single();
      if (error) throw error; saved = data;
    }
    await openDash();
    drawList(saved.id);
    $("dashMsg").textContent = `C'est prêt ! Copie le lien de la surprise pour ${saved.nom} et envoie-le.`
      + (photosLeft ? "" : " (Les photos retirées n'ont pas pu être effacées du stockage : elles le seront au prochain nettoyage.)");
  } catch (err) {
    $("saveBtn").disabled = false;
    const m = (err && err.message) || "";
    $("formMsg").textContent = m === "upload" ? "L'envoi d'une photo a échoué. Vérifie ta connexion et réessaie."
      : m.includes("Limite atteinte") ? "Tu as atteint la limite de 50 surprises. Supprimes-en une pour en créer une nouvelle."
      : "L'enregistrement a échoué. Réessaie.";
    drawThumbs();
  }
});

/* =====================================================================
   ESPACE PROPRIÉTAIRE (codes d'activation, clients)
   ===================================================================== */
const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
function cell(tr, text, cls) { const td = document.createElement("td"); if (cls) td.className = cls; td.textContent = text; tr.appendChild(td); return td; }
function head(tbl, cols) {
  tbl.innerHTML = ""; const tr = document.createElement("tr");
  cols.forEach(c => { const th = document.createElement("th"); th.textContent = c; tr.appendChild(th); });
  const thead = document.createElement("thead"); thead.appendChild(tr); tbl.appendChild(thead);
  const tb = document.createElement("tbody"); tbl.appendChild(tb); return tb;
}
function emptyRow(tb, text, cols) { const tr = document.createElement("tr"); cell(tr, text, "empty-row").colSpan = cols; tb.appendChild(tr); }
function chip(td, text, kind) { td.textContent = ""; const s = document.createElement("span"); s.className = "chip " + kind; s.textContent = text; td.appendChild(s); }
// Bouton qui demande un 2e clic avant d'agir.
function armedButton(label, confirmLabel, cls, action) {
  const b = document.createElement("button"); b.type = "button"; b.className = "pill " + cls; b.textContent = label;
  b.onclick = async () => {
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = confirmLabel; setTimeout(() => { delete b.dataset.armed; b.textContent = label; }, 4000); return; }
    b.disabled = true; await action(); b.disabled = false;
  };
  return b;
}
// Supprime un client : d'abord ses photos, puis son compte (surprises effacées en cascade).
async function deleteClient(userId, email) {
  try {
    const paths = await listFolder(userId);
    if (paths.length && !(await removePhotos(paths))) throw new Error("photos");
    const { error } = await sb.rpc("owner_delete_client", { p_user: userId });
    if (error) throw error;
    $("ownerMsg").textContent = `${email} et toutes ses données ont été supprimés.`;
  } catch { $("ownerMsg").textContent = `La suppression de ${email} a échoué. Réessaie.`; }
  loadMembers(); loadPending();
}

async function openOwner() {
  show("v-owner"); $("genMsg").textContent = ""; $("ownerMsg").textContent = "";
  $("orphMsg").textContent = ""; $("orphDel").hidden = true;
  await Promise.all([loadCodes(), loadMembers(), loadPending()]);
}
async function loadCodes(fresh = []) {
  const { data, error } = await sb.rpc("owner_list_codes");
  const tb = head($("codesTbl"), ["Code", "Note", "Statut", ""]);
  if (error) return emptyRow(tb, "Impossible de charger les codes.", 4);
  if (!data.length) return emptyRow(tb, "Aucun code pour l'instant. Génères-en un ci-dessus.", 4);
  data.forEach(c => {
    const tr = document.createElement("tr"); if (fresh.includes(c.code)) tr.className = "new";
    cell(tr, c.code, "mono"); cell(tr, c.note || "—");
    const st = cell(tr, "");
    if (c.used_at) chip(st, `Utilisé par ${c.used_email || "compte supprimé"} le ${fmtDate(c.used_at)}`, "used");
    else chip(st, "Libre", "free");
    const act = cell(tr, "");
    if (!c.used_at) {
      const cp = document.createElement("button"); cp.type = "button"; cp.className = "pill solid"; cp.textContent = "Copier";
      cp.onclick = async () => { try { await navigator.clipboard.writeText(c.code); cp.textContent = "Copié ✓"; } catch { cp.textContent = c.code; } setTimeout(() => cp.textContent = "Copier", 2000); };
      const del = armedButton("Supprimer", "Confirmer", "danger", async () => {
        const { error } = await sb.rpc("owner_delete_code", { p_code: c.code });
        if (error) { $("genMsg").textContent = "La suppression a échoué."; return; }
        loadCodes();
      });
      const wrap = document.createElement("div"); wrap.className = "item-actions"; wrap.append(cp, del); act.appendChild(wrap);
    }
    tb.appendChild(tr);
  });
}
async function loadMembers() {
  const { data, error } = await sb.rpc("owner_list_members");
  const tb = head($("membersTbl"), ["E-mail", "Depuis", "Surprises", "Statut", ""]);
  if (error) return emptyRow(tb, "Impossible de charger les clients.", 5);
  if (!data.length) return emptyRow(tb, "Aucun client activé pour l'instant.", 5);
  data.forEach(m => {
    const tr = document.createElement("tr");
    cell(tr, m.email); cell(tr, fmtDate(m.created_at)); cell(tr, String(m.nb_surprises));
    chip(cell(tr, ""), m.active ? "Actif" : "Désactivé", m.active ? "free" : "off");
    const toggle = m.active
      ? armedButton("Désactiver", "Confirmer", "danger", () => setActive(m, false))
      : armedButton("Réactiver", "Confirmer", "", () => setActive(m, true));
    const del = armedButton("Supprimer", "Tout effacer ?", "danger", () => deleteClient(m.user_id, m.email));
    const wrap = document.createElement("div"); wrap.className = "item-actions"; wrap.append(toggle, del);
    cell(tr, "").appendChild(wrap);
    tb.appendChild(tr);
  });
}
async function setActive(m, active) {
  const { error } = await sb.rpc("owner_set_active", { p_user: m.user_id, p_active: active });
  if (error) { $("ownerMsg").textContent = "Le changement a échoué."; return; }
  $("ownerMsg").textContent = active ? `${m.email} est réactivé.` : `${m.email} est désactivé : ses liens ne s'ouvrent plus.`;
  loadMembers();
}
async function loadPending() {
  const { data, error } = await sb.rpc("owner_list_pending");
  const tb = head($("pendingTbl"), ["E-mail", "Inscrit le", ""]);
  if (error) return emptyRow(tb, "Impossible de charger ces comptes.", 3);
  if (!data.length) return emptyRow(tb, "Aucun compte en attente.", 3);
  data.forEach(u => {
    const tr = document.createElement("tr");
    cell(tr, u.email); cell(tr, fmtDate(u.created_at));
    cell(tr, "").appendChild(armedButton("Supprimer", "Confirmer", "danger", () => deleteClient(u.user_id, u.email)));
    tb.appendChild(tr);
  });
}
let orphans = [];
$("orphFind").addEventListener("click", async () => {
  $("orphMsg").textContent = "Recherche…"; $("orphDel").hidden = true;
  const { data, error } = await sb.rpc("owner_list_orphans");
  if (error) { $("orphMsg").textContent = "La recherche a échoué."; return; }
  orphans = data.map(o => o.name);
  $("orphMsg").textContent = orphans.length ? `${orphans.length} photo${orphans.length > 1 ? "s" : ""} inutilisée${orphans.length > 1 ? "s" : ""}.` : "Aucune photo inutilisée. Tout est propre.";
  $("orphDel").hidden = !orphans.length;
  $("orphDel").textContent = `Supprimer ${orphans.length} photo${orphans.length > 1 ? "s" : ""}`;
});
$("orphDel").addEventListener("click", async () => {
  $("orphDel").disabled = true;
  const ok = await removePhotos(orphans);
  $("orphDel").disabled = false; $("orphDel").hidden = ok;
  $("orphMsg").textContent = ok ? "Photos inutilisées supprimées." : "Une partie n'a pas pu être supprimée. Réessaie.";
});
$("genForm").addEventListener("submit", async e => {
  e.preventDefault();
  const n = Math.min(50, Math.max(1, parseInt($("g-count").value, 10) || 1));
  $("genBtn").disabled = true; $("genMsg").textContent = "Génération…";
  const { data, error } = await sb.rpc("owner_create_codes", { p_count: n, p_note: $("g-note").value.trim() });
  $("genBtn").disabled = false;
  if (error) { $("genMsg").textContent = "La génération a échoué. Réessaie."; return; }
  $("genMsg").textContent = n > 1 ? `${n} codes créés (surlignés en jaune).` : `Code créé : ${data[0]}. Donne-le à ton client.`;
  $("g-note").value = "";
  loadCodes(data);
});
$("ownerBtn").addEventListener("click", openOwner);
$("ownerClose").addEventListener("click", () => openDash());
$("ownerBack").addEventListener("click", () => openDash());

/* =====================================================================
   DÉMARRAGE
   ===================================================================== */
(async () => {
  if (!sb) return show("v-config");
  const s = new URLSearchParams(location.search).get("s");
  if (s) return openRecipient(s);

  sb.auth.onAuthStateChange((event, session) => {
    me = session ? session.user : null;
    if (event === "PASSWORD_RECOVERY") { recovering = true; show("v-reset"); return; }
    if (recovering) return;
    if (event === "SIGNED_IN" && !$("v-auth").hidden) setTimeout(route, 0);
    if (event === "SIGNED_OUT") { isOwner = false; signedCache.clear(); setAuthMode(false); show("v-auth"); }
  });
  const { data } = await sb.auth.getSession();
  if (recovering) return;
  me = data.session ? data.session.user : null;
  if (me) route(); else { setAuthMode(false); show("v-auth"); }
})();
