(function () {
  const config = window.TORNEO;
  const form = document.getElementById("form");
  const submitButton = document.getElementById("submit");
  let lastMessage = "";

  const NAME_PART = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:['’-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
  const TEAM_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)*$/;

  document.querySelector(".ig-link").href = config.instagramProfile;
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
        showServerError(data.error);
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

    const ruts = players.map((player) => player && normalizeRut(player.rut)).filter(Boolean);
    if (new Set(ruts).size !== ruts.length) {
      errors.push({ id: "form", message: "Cada jugador tiene que tener un RUT distinto." });
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

  function showServerError(code) {
    const messages = {
      ofensivo: ["team", "Elige un nombre de equipo respetuoso."],
      equipo: ["team", "Ese nombre de equipo ya está reservado."],
      cupos: ["form", "Los 16 cupos ya están reservados."],
      duplicado: ["form", "Ese RUT ya está inscrito en otro equipo."],
      repetido: ["form", "Cada jugador tiene que tener un RUT distinto."],
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

  function showSuccess(data, payload) {
    form.hidden = true;
    document.getElementById("inactive").hidden = true;
    const success = document.getElementById("success");
    success.hidden = false;
    document.getElementById("success-title").textContent = "Tu cupo quedó reservado";
    document.getElementById("success-lead").textContent =
      "Transfiere " + config.amountLabel + " con el código " + config.payment.reference + " para confirmarlo. El cupo sigue reservado a nombre de tu equipo hasta que los organizadores vean el comprobante.";
    document.getElementById("team-code").textContent = data.code || "";
    document.getElementById("success-team").textContent = data.teamName || payload.teamName;
    const missingFourth = payload.players.length < 4;
    document.getElementById("fourth-note").textContent = missingFourth
      ? "Si todavía no tienen al cuarto jugador, pueden mandar el nombre y el RUT por el mismo mensaje de Instagram."
      : "En el mensaje de Instagram adjunta el comprobante y el código de tu equipo.";
    lastMessage = [
      "Hola, reservamos el equipo " + (data.teamName || payload.teamName) + " (código " + (data.code || "") + ").",
      "Adjuntamos el comprobante de " + config.amountLabel + ".",
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
})();
