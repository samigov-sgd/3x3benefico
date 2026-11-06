(function () {
  const config = window.TORNEO;
  const form = document.getElementById("form");
  const submitButton = document.getElementById("submit");
  let lastMessage = "";

  const NAME_PART = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:['’-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
  const TEAM_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)*$/;

  document.querySelector(".ig-link").href = config.instagramProfile;
  startLive();
  if (config.inscriptionsOpen === false) return;
  document.getElementById("ig-button").href = config.instagramDm;

  document.querySelectorAll('input[name$="rut"]').forEach((input) => {
    input.addEventListener("blur", () => {
      if (/^\d{7,8}[0-9K]$/i.test(normalizeRut(input.value))) input.value = formatRut(input.value);
    });
  });

  form.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    event.target.removeAttribute("aria-invalid");
    const error = document.getElementById("error-" + errorKey(event.target));
    if (error) error.textContent = "";
  });

  form.addEventListener("submit", onSubmit);
  document.getElementById("copy-message").addEventListener("click", copyMessage);
  document.getElementById("another").addEventListener("click", () => window.location.reload());
  fillPayment();
  loadCupos();

  function errorKey(input) {
    if (input.name === "teamName") return "team";
    if (input.name === "whatsapp") return "whatsapp";
    const match = input.name.match(/^p(\d)(name|rut)$/);
    return match ? "p" + match[1] + match[2] : input.name;
  }

  async function loadCupos() {
    if (!config.scriptUrl) {
      document.getElementById("inactive").hidden = false;
      submitButton.disabled = true;
      submitButton.textContent = "Inscripciones pronto";
      document.getElementById("cupos-count").textContent = "16 cupos";
      document.getElementById("cupos-note").textContent = "Las inscripciones en línea todavía no están activas.";
      return;
    }

    document.getElementById("cupos-count").textContent = "Cargando cupos…";
    try {
      const response = await fetch(config.scriptUrl + "?t=" + Date.now(), { cache: "no-store" });
      const data = await response.json();
      renderCupos(data);
    } catch (error) {
      document.getElementById("cupos-count").textContent = "16 cupos";
      document.getElementById("cupos-note").textContent = "No pudimos cargar los cupos. Puedes intentar reservar igual.";
    }
  }

  function renderCupos(data) {
    const max = Number(data.max) || config.maxTeams;
    const taken = Number(data.taken) || 0;
    const left = Math.max(max - taken, 0);
    const count = document.getElementById("cupos-count");
    if (left === 0) count.textContent = "No quedan cupos";
    else if (left === 1) count.textContent = "Queda 1 de " + max;
    else count.textContent = "Quedan " + left + " de " + max;

    document.getElementById("cupos-note").textContent = "Cada inscripción reserva un cupo hasta que se confirma la transferencia.";

    if (left === 0 && document.getElementById("success").hidden) {
      form.hidden = true;
      document.getElementById("closed").hidden = false;
    }

    if (!Array.isArray(data.teams)) return;
    const teams = data.teams.filter(Boolean);
    const list = document.getElementById("teams");
    list.replaceChildren();
    document.getElementById("teams-section").hidden = teams.length === 0;
    teams.forEach((name) => {
      const item = document.createElement("li");
      item.textContent = name;
      list.appendChild(item);
    });
  }

  async function onSubmit(event) {
    event.preventDefault();
    clearFormError();
    const result = validateForm(new FormData(form));
    if (!result.ok) {
      showErrors(result.errors);
      return;
    }
    if (!config.scriptUrl) {
      showFormError("Las inscripciones aún no están activas.");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Reservando…";
    try {
      const response = await fetch(config.scriptUrl, {
        method: "POST",
        redirect: "follow",
        cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(result.payload)
      });
      const data = await response.json();
      if (!data.ok) {
        showServerError(data);
        return;
      }
      showSuccess(data, result.payload);
      if (typeof data.taken === "number") renderCupos(data);
    } catch (error) {
      showFormError("No pudimos guardar la reserva. Intenta de nuevo en unos segundos.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Reservar cupo";
    }
  }

  function validateForm(data) {
    const errors = [];
    const website = String(data.get("website") || "").trim();
    if (website) errors.push({ id: "form", message: "No pudimos guardar la reserva." });

    const teamName = String(data.get("teamName") || "").trim().replace(/\s+/g, " ");
    if (teamName.length < 3 || teamName.length > 30 || !TEAM_RE.test(teamName)) {
      errors.push({ id: "team", message: "Usa un nombre de 3 a 30 letras o números." });
    } else if (isOffensive(teamName)) {
      errors.push({ id: "team", message: "Elige un nombre de equipo respetuoso." });
    }

    const players = [];
    for (let index = 1; index <= 3; index += 1) {
      players.push(readPlayer(data, index, true, errors));
    }
    const fourth = readPlayer(data, 4, false, errors);
    if (fourth) players.push(fourth);

    const seenRut = {};
    for (let index = 1; index <= 4; index += 1) {
      const raw = String(data.get("p" + index + "rut") || "");
      const key = normalizeRut(raw);
      if (!key || !isValidRut(raw)) continue;
      if (seenRut[key]) {
        errors.push({
          id: "p" + index + "rut",
          message: "El RUT " + formatRut(raw) + " ya está escrito en este equipo. Un jugador no puede inscribirse dos veces."
        });
      } else {
        seenRut[key] = index;
      }
    }

    const whatsapp = normalizePhone(data.get("whatsapp"));
    if (!whatsapp) {
      errors.push({ id: "whatsapp", message: "Escribe un WhatsApp chileno, por ejemplo +56 9 1234 5678." });
    }

    return {
      ok: errors.length === 0,
      errors,
      payload: {
        teamName,
        players: players.filter(Boolean),
        whatsapp,
        website
      }
    };
  }

  function readPlayer(data, index, required, errors) {
    const name = String(data.get("p" + index + "name") || "").trim().replace(/\s+/g, " ");
    const rutInput = String(data.get("p" + index + "rut") || "").trim();
    const rut = formatRut(rutInput);

    if (!required && !name && !rutInput) return null;

    if (!name || !rutInput) {
      if (!name) errors.push({ id: "p" + index + "name", message: "Falta el nombre." });
      if (!rutInput) errors.push({ id: "p" + index + "rut", message: "Falta el RUT." });
      return { name, rut: rut || rutInput };
    }

    if (!isPersonName(name)) {
      errors.push({ id: "p" + index + "name", message: "Escribe nombre y apellido." });
    }
    if (!rut || !isValidRut(rutInput)) {
      errors.push({ id: "p" + index + "rut", message: "Revisa el RUT. Tiene que incluir el dígito verificador." });
    }
    return { name, rut: rut || rutInput };
  }

  function showErrors(errors) {
    let first = null;
    errors.forEach((error) => {
      if (error.id === "form") {
        showFormError(error.message);
        return;
      }
      const field = fieldFor(error.id);
      const message = document.getElementById("error-" + error.id);
      if (message) message.textContent = error.message;
      if (field) {
        field.setAttribute("aria-invalid", "true");
        if (!first) first = field;
      }
    });
    if (first) first.focus();
  }

  function fieldFor(id) {
    if (id === "team") return document.getElementById("team-name");
    if (id === "whatsapp") return document.getElementById("whatsapp");
    const match = id.match(/^p(\d)(name|rut)$/);
    return match ? document.getElementById("p" + match[1] + "-" + match[2]) : null;
  }

  function showServerError(data) {
    const code = typeof data === "string" ? data : data.error;
    if (code === "duplicado" || code === "repetido") {
      const message = playerTakenMessage(data, code);
      const fieldId = rutFieldId(data.rut);
      if (fieldId) showErrors([{ id: fieldId, message: message }]);
      showFormError(message);
      return;
    }
    const messages = {
      ofensivo: ["team", "Elige un nombre de equipo respetuoso."],
      equipo: ["team", "Ese nombre de equipo ya está reservado."],
      cupos: ["form", "Los 16 cupos ya están reservados."],
      rut: ["form", "Hay un RUT que no coincide con el dígito verificador."],
      whatsapp: ["whatsapp", "Escribe un WhatsApp chileno, por ejemplo +56 9 1234 5678."],
      ocupado: ["form", "Otro equipo se está inscribiendo. Intenta otra vez en unos segundos."]
    };
    const match = messages[code] || ["form", "No pudimos guardar la reserva. Revisa los datos e intenta de nuevo."];
    if (match[0] === "form") showFormError(match[1]);
    else showErrors([{ id: match[0], message: match[1] }]);
    if (code === "cupos") {
      form.hidden = true;
      document.getElementById("closed").hidden = false;
      document.getElementById("cupos-count").textContent = "No quedan cupos";
    }
  }

  function playerTakenMessage(data, code) {
    const rut = data && data.rut ? data.rut : "";
    const name = rut ? playerNameForRut(rut) : "";
    const who = name && rut ? name + " (RUT " + rut + ")" : rut ? "El jugador con RUT " + rut : "Ese jugador";
    if (code === "repetido") {
      return who + " ya está escrito en este equipo. Un jugador no puede inscribirse dos veces.";
    }
    if (data && data.team) {
      return who + " ya está inscrito en el equipo " + data.team + ". Un jugador no puede estar en dos equipos.";
    }
    return who + " ya está inscrito en otro equipo. Un jugador no puede estar en dos equipos.";
  }

  function playerNameForRut(rut) {
    const key = normalizeRut(rut);
    for (let index = 1; index <= 4; index += 1) {
      const field = document.getElementById("p" + index + "-rut");
      if (field && normalizeRut(field.value) === key) {
        return document.getElementById("p" + index + "-name").value.trim();
      }
    }
    return "";
  }

  function rutFieldId(rut) {
    if (!rut) return "";
    const key = normalizeRut(rut);
    for (let index = 1; index <= 4; index += 1) {
      const field = document.getElementById("p" + index + "-rut");
      if (field && normalizeRut(field.value) === key) return "p" + index + "rut";
    }
    return "";
  }

  function showSuccess(data, payload) {
    form.hidden = true;
    document.getElementById("inactive").hidden = true;
    const success = document.getElementById("success");
    success.hidden = false;
    document.getElementById("success-title").textContent = "Tu cupo quedó reservado";
    document.getElementById("success-lead").textContent =
      "Transfiere " + config.amountWords + " (" + config.amountLabel + ") con el código " + config.payment.reference + " para confirmarlo. El cupo sigue reservado a nombre de tu equipo hasta que los organizadores vean el comprobante.";
    document.getElementById("team-code").textContent = data.code || "";
    document.getElementById("success-team").textContent = data.teamName || payload.teamName;
    const missingFourth = payload.players.length < 4;
    document.getElementById("fourth-note").textContent = missingFourth
      ? "Si todavía no tienen al cuarto jugador, pueden mandar el nombre y el RUT por el mismo mensaje de Instagram."
      : "En el mensaje de Instagram adjunta el comprobante y el código de tu equipo.";
    lastMessage = [
      "Hola, reservamos el equipo " + (data.teamName || payload.teamName) + " (código " + (data.code || "") + ").",
      "Adjuntamos el comprobante de " + config.amountWords + " (" + config.amountLabel + ").",
      "Referencia " + config.payment.reference + ".",
      missingFourth ? "El cuarto jugador lo enviamos después." : ""
    ].filter(Boolean).join(" ");
    success.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fillPayment() {
    const pay = config.payment;
    const rows = [
      ["Banco", pay.bank],
      ["Tipo de cuenta", pay.accountType],
      ["Número de cuenta", pay.accountNumber],
      ["Titular", pay.holder],
      ["RUT", pay.rut],
      ["Correo de aviso", pay.email],
      ["Código de referencia", pay.reference],
      ["Monto", config.amountLabel]
    ];
    const grid = document.getElementById("pay-grid");
    rows.forEach(([label, value]) => {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const row = document.createElement("div");
      row.className = "pay-row";
      const dd = document.createElement("dd");
      dd.textContent = value;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "copy";
      button.textContent = "Copiar";
      button.addEventListener("click", () => copyValue(value, button));
      row.append(dd, button);
      wrap.append(dt, row);
      grid.appendChild(wrap);
    });
  }

  async function copyValue(value, button) {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    button.textContent = "Copiado";
    window.setTimeout(() => {
      button.textContent = original;
    }, 1600);
  }

  function copyMessage() {
    if (!lastMessage) return;
    copyValue(lastMessage, document.getElementById("copy-message"));
  }

  function showFormError(message) {
    const box = document.getElementById("form-error");
    box.hidden = false;
    box.textContent = message;
  }

  function clearFormError() {
    const box = document.getElementById("form-error");
    box.hidden = true;
    box.textContent = "";
    form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
    form.querySelectorAll(".error").forEach((field) => {
      field.textContent = "";
    });
  }

  function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("56") && digits.length >= 11) digits = digits.slice(2);
    if (digits.length === 9 && digits.startsWith("9")) {
      return "+56 " + digits.charAt(0) + " " + digits.slice(1, 5) + " " + digits.slice(5);
    }
    return "";
  }

  function isPersonName(value) {
    const parts = value.split(" ");
    if (parts.length < 2 || value.length > 80) return false;
    return parts.every((part) => part.length >= 2 && NAME_PART.test(part));
  }

  function normalizeRut(value) {
    return String(value || "").replace(/[^0-9kK]/g, "").toUpperCase();
  }

  function formatRut(value) {
    const clean = normalizeRut(value);
    if (clean.length < 2) return "";
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    const dotted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return dotted + "-" + dv;
  }

  function isValidRut(value) {
    const clean = normalizeRut(value);
    if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
    return rutDv(clean.slice(0, -1)) === clean.slice(-1);
  }

  function rutDv(body) {
    let sum = 0;
    let factor = 2;
    for (let index = body.length - 1; index >= 0; index -= 1) {
      sum += Number(body[index]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    const rest = 11 - (sum % 11);
    if (rest === 11) return "0";
    if (rest === 10) return "K";
    return String(rest);
  }

  function normalizeForModeration(value) {
    const leet = { 4: "a", 3: "e", 1: "i", 0: "o", 5: "s", 7: "t", "@": "a", $: "s", "!": "i" };
    const mapped = String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split("")
      .map((char) => leet[char] || char)
      .join("");
    return mapped.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function collapseRuns(value) {
    return value.replace(/(.)\1+/g, "$1");
  }

  function isOffensive(value) {
    const spaced = normalizeForModeration(value);
    if (!spaced) return false;
    const parts = spaced.split(" ");
    const squeezed = collapseRuns(parts.join("").replace(/\d/g, ""));
    const candidates = new Set([squeezed]);
    parts.forEach((part) => {
      const bare = part.replace(/\d/g, "");
      candidates.add(part);
      candidates.add(collapseRuns(part));
      candidates.add(bare);
      candidates.add(collapseRuns(bare));
    });
    const tokens = config.blockedTokens || [];
    const phrases = config.blockedPhrases || [];
    for (const candidate of candidates) {
      if (tokens.indexOf(candidate) !== -1) return true;
    }
    return phrases.some((phrase) => squeezed.indexOf(phrase) !== -1);
  }

  function startLive() {
    const engine = window.TORNEO_BRACKET;
    const lookup = document.getElementById("team-lookup");
    const schedule = document.getElementById("schedule");
    const callout = document.getElementById("team-callout");
    const liveNote = document.getElementById("live-note");
    const resultForm = document.getElementById("result-form");
    const resultGame = document.getElementById("result-game");
    const scoreA = document.getElementById("score-a");
    const scoreB = document.getElementById("score-b");
    const labelA = document.getElementById("score-label-a");
    const labelB = document.getElementById("score-label-b");
    const status = document.getElementById("result-status");
    if (!engine || !schedule) return;

    let games = engine.build({});
    let stamp = "";
    let sawResults = false;

    render();
    startPhases();
    refresh();
    window.setInterval(refresh, 20000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    document.addEventListener("torneo:results", (event) => {
      games = engine.build(event.detail || {});
      sawResults = true;
      render();
      if (liveNote) liveNote.textContent = "Resultados actualizados.";
    });
    if (lookup) lookup.addEventListener("input", paintSchedule);
    if (resultGame) resultGame.addEventListener("change", syncScoreLabels);
    if (resultForm) resultForm.addEventListener("submit", saveResult);

    function render() {
      paintBoard();
      paintSchedule();
      paintResultChoices();
    }

    async function refresh() {
      if (!config.scriptUrl) return;
      try {
        const response = await fetch(config.scriptUrl + "?t=" + Date.now(), { cache: "no-store" });
        const data = await response.json();
        const results = data && data.results ? data.results : {};
        const nextStamp = JSON.stringify(results);
        const changed = stamp !== "" && stamp !== nextStamp;
        stamp = nextStamp;
        games = engine.build(results);
        if (Object.keys(results).length) sawResults = true;
        render();
        if (!liveNote) return;
        if (changed) liveNote.textContent = "Resultados actualizados.";
        else if (!sawResults) liveNote.textContent = "Todavía no hay resultados. Este es el programa.";
        else liveNote.textContent = "El cuadro se actualiza solo.";
      } catch (error) {
        if (liveNote && !sawResults) liveNote.textContent = "No pudimos actualizar los resultados. El programa sigue visible.";
      }
    }

    function startPhases() {
      const track = document.getElementById("phase-track");
      const label = document.getElementById("phase-now");
      const dots = [...document.querySelectorAll(".phase-dot")];
      const names = ["Preliminar", "Cuartos", "Semifinal", "Final"];
      if (!track || !dots.length) return;

      const update = () => {
        const width = track.clientWidth || 1;
        const index = Math.min(names.length - 1, Math.max(0, Math.round(track.scrollLeft / width)));
        dots.forEach((dot, dotIndex) => {
          const on = dotIndex === index;
          dot.classList.toggle("is-on", on);
          dot.setAttribute("aria-current", on ? "true" : "false");
        });
        if (label) label.textContent = names[index];
      };

      track.addEventListener("scroll", update, { passive: true });
      dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
          track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
        });
      });
      update();
    }

    function paintBoard() {
      games.forEach((game) => {
        document.querySelectorAll('.slot[data-game="' + game.id + '"]').forEach((slot) => {
          paintSide(slot.querySelector('[data-side="a"]'), game.a, game.aReady, game.winner);
          paintSide(slot.querySelector('[data-side="b"]'), game.b, game.bReady, game.winner);
          const score = slot.querySelector("[data-score]");
          if (!score) return;
          if (game.score) {
            score.hidden = false;
            score.textContent = game.score.a + "–" + game.score.b;
          } else {
            score.hidden = true;
            score.textContent = "";
          }
        });
      });
    }

    function paintSide(node, name, ready, winner) {
      if (!node) return;
      node.textContent = name;
      node.classList.toggle("is-winner", Boolean(winner) && ready && winner === name);
      node.classList.toggle("is-loser", Boolean(winner) && ready && winner !== name);
    }

    function paintSchedule() {
      const hits = engine.findTeams(games, lookup ? lookup.value : "");
      const visible = hits.length
        ? games.filter((game) => hits.indexOf(game.a) !== -1 || hits.indexOf(game.b) !== -1)
        : games;
      schedule.replaceChildren();
      if (!visible.length) {
        const empty = document.createElement("li");
        empty.className = "match-note";
        empty.textContent = "No aparece ese equipo.";
        schedule.appendChild(empty);
      }
      visible.forEach((game) => {
        const item = document.createElement("li");
        item.className = "match" + (game.score ? " played" : "");
        const time = document.createElement("p");
        time.className = "match-time";
        time.textContent = game.time;
        const body = document.createElement("div");
        const round = document.createElement("p");
        round.className = "match-round";
        round.textContent = game.label;
        const teams = document.createElement("p");
        teams.className = "match-teams";
        teams.textContent = game.score
          ? game.a + " " + game.score.a + " – " + game.score.b + " " + game.b
          : game.a + " vs " + game.b;
        body.append(round, teams);
        if (game.winner) {
          const note = document.createElement("p");
          note.className = "match-note";
          note.textContent = "Pasa " + game.winner;
          body.append(note);
        }
        item.append(time, body);
        schedule.appendChild(item);
      });

      if (!callout) return;
      if (hits.length === 1) {
        callout.hidden = false;
        callout.textContent = nextLine(hits[0]);
      } else if (hits.length > 1) {
        callout.hidden = false;
        callout.textContent = "Hay más de un equipo con ese texto. Afina la búsqueda.";
      } else {
        callout.hidden = true;
        callout.textContent = "";
      }
    }

    function nextLine(name) {
      const path = games.filter((game) => (game.aReady && game.a === name) || (game.bReady && game.b === name));
      const finalWin = path.find((game) => game.id === "f" && game.winner === name);
      if (finalWin) return name + " es el campeón.";
      const lost = path.find((game) => game.winner && game.winner !== name);
      if (lost && lost.id === "f") return name + " perdió la final.";
      if (lost) return name + " quedó fuera en " + lost.label.toLowerCase() + ".";
      const next = path.find((game) => !game.score);
      if (!next) return name + " sigue en el cuadro.";
      const rival = next.a === name ? next.b : next.a;
      return "A " + name + " le toca a las " + next.time + ", " + next.label + ", contra " + rival + ".";
    }

    function paintResultChoices() {
      if (!resultGame) return;
      const previous = resultGame.value;
      resultGame.replaceChildren();
      games.filter((game) => game.ready).forEach((game) => {
        const option = document.createElement("option");
        option.value = game.id;
        const mark = game.score ? " (" + game.score.a + "-" + game.score.b + ")" : "";
        option.textContent = game.time + " · " + game.label + " · " + game.a + " vs " + game.b + mark;
        resultGame.appendChild(option);
      });
      if ([...resultGame.options].some((option) => option.value === previous)) resultGame.value = previous;
      syncScoreLabels();
    }

    function syncScoreLabels() {
      if (!resultGame || !labelA || !labelB) return;
      const game = games.find((item) => item.id === resultGame.value);
      if (!game) return;
      labelA.textContent = "Puntos de " + game.a;
      labelB.textContent = "Puntos de " + game.b;
    }

    async function saveResult(event) {
      event.preventDefault();
      const game = games.find((item) => item.id === resultGame.value);
      const a = parseScore(scoreA.value);
      const b = parseScore(scoreB.value);
      const clave = document.getElementById("result-clave").value;
      const button = document.getElementById("result-save");
      if (!game || !game.ready) return setStatus("Ese partido todavía no tiene a los dos equipos.", false);
      if (a === null || b === null) return setStatus("Escribe los dos marcadores con números enteros.", false);
      if (a === b) return setStatus("No puede quedar empatado. Si se acaba empatado el tiempo, se juega el alargue.", false);
      if (!config.scriptUrl) return setStatus("Falta conectar la planilla.", false);

      button.disabled = true;
      setStatus("Guardando…", true);
      try {
        const response = await fetch(config.scriptUrl, {
          method: "POST",
          redirect: "follow",
          cache: "no-store",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "resultado", game: game.id, scoreA: a, scoreB: b, clave: clave })
        });
        const data = await response.json();
        if (!data.ok) {
          setStatus(resultError(data.error), false);
          return;
        }
        const results = data.results || {};
        games = engine.build(results);
        stamp = JSON.stringify(results);
        sawResults = true;
        render();
        scoreA.value = "";
        scoreB.value = "";
        if (liveNote) liveNote.textContent = "Resultados actualizados.";
        setStatus("Resultado guardado. El cuadro ya quedó actualizado.", true);
      } catch (error) {
        setStatus("No se pudo guardar. Revisa la conexión.", false);
      } finally {
        button.disabled = false;
      }
    }

    function parseScore(value) {
      if (!/^\d+$/.test(String(value || "").trim())) return null;
      const number = Number(value);
      if (!Number.isInteger(number) || number > 50) return null;
      return number;
    }

    function setStatus(message, ok) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("good", Boolean(ok));
      status.classList.toggle("bad", !ok);
    }

    function resultError(code) {
      if (code === "clave") return "La clave no coincide.";
      if (code === "marcador") return "El marcador no sirve. Tienen que ser dos números distintos.";
      if (code === "partido") return "Ese partido todavía no se puede cargar. Falta el ganador de antes.";
      if (code === "ocupado") return "Alguien más está guardando. Intenta otra vez.";
      return "No se guardó. En la planilla hay que publicar una implementación nueva de la aplicación web.";
    }
  }
})();
