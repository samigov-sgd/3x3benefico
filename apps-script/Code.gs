/**
 * Inscripciones del 3x3 benéfico.
 * Pégalo en Extensiones > Apps Script de la Google Sheet y despliega
 * como aplicación web: ejecutar como tú, acceso "Cualquiera".
 * La lista de insultos tiene que coincidir con config.js.
 */
var MAX_TEAMS = 16;
var HEADERS = ["Fecha", "Código", "Equipo", "Jugador 1", "RUT 1", "Jugador 2", "RUT 2", "Jugador 3", "RUT 3", "Jugador 4", "RUT 4", "WhatsApp", "Estado"];
var BLOCKED_TOKENS = ["puta", "puto", "putas", "putos", "mierda", "ctm", "ctms", "csm", "concha", "chucha", "culiao", "culiaos", "qliao", "qlia", "qls", "ql", "weon", "weona", "wn", "aweonao", "aweona", "maricon", "marica", "maricas", "maricona", "hdp", "reculiao", "reculia", "forro", "forra", "pelotudo", "pelotuda", "malparido", "malparida", "carepalo", "fuck", "fucking", "shit", "bitch", "asshole", "nigga", "nigger", "faggot", "whore"];
var BLOCKED_PHRASES = ["conchetumare", "conchetumadre", "conchatumadre", "conchesumadre", "conchatumare", "hijodeputa", "hijodelaperra", "gilipollas", "chupapico", "carepalo", "malparido"];
var NAME_PART = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:['’-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
var TEAM_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)*$/;

function doGet() {
  try {
    var teams = listTeams();
    return json({
      ok: true,
      taken: teams.length,
      max: MAX_TEAMS,
      open: teams.length < MAX_TEAMS,
      teams: teams
    });
  } catch (error) {
    return json({ ok: false, error: "invalido" });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 4000) {
      return json({ ok: false, error: "invalido" });
    }
    var data = JSON.parse(e.postData.contents);
    if (data.website) return json({ ok: false, error: "invalido" });

    var checked = validatePayload(data);
    if (!checked.ok) return json({ ok: false, error: checked.error });

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return json({ ok: false, error: "ocupado" });
    try {
      var sheet = getSheet();
      var rows = readRows(sheet);
      var occupying = rows.filter(function (row) { return occupies(row[12]); });
      if (occupying.length >= MAX_TEAMS) return json({ ok: false, error: "cupos" });

      var teamKey = fold(checked.teamName);
      var rutKeys = checked.players.map(function (player) { return normalizeRut(player.rut); });
      var duplicatedTeam = occupying.some(function (row) { return fold(row[2]) === teamKey; });
      if (duplicatedTeam) return json({ ok: false, error: "equipo" });

      var duplicatedRut = occupying.some(function (row) {
        return [row[4], row[6], row[8], row[10]].some(function (rut) {
          var key = normalizeRut(rut);
          return key && rutKeys.indexOf(key) !== -1;
        });
      });
      if (duplicatedRut) return json({ ok: false, error: "duplicado" });

      var code = uniqueCode(rows);
      var players = checked.players.concat([null, null, null, null]).slice(0, 4);
      var now = Utilities.formatDate(new Date(), "America/Santiago", "dd-MM-yyyy HH:mm");
      sheet.appendRow([
        now,
        code,
        safeCell(checked.teamName),
        safeCell(players[0].name),
        players[0].rut,
        safeCell(players[1].name),
        players[1].rut,
        safeCell(players[2].name),
        players[2].rut,
        players[3] ? safeCell(players[3].name) : "",
        players[3] ? players[3].rut : "",
        checked.whatsapp,
        "reservado"
      ]);

      var teams = listTeamsFromRows(readRows(sheet));
      return json({
        ok: true,
        code: code,
        teamName: checked.teamName,
        taken: teams.length,
        max: MAX_TEAMS,
        open: teams.length < MAX_TEAMS,
        teams: teams
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return json({ ok: false, error: "invalido" });
  }
}

function validatePayload(data) {
  if (!data || typeof data !== "object") return { ok: false, error: "incompleto" };
  var teamName = cleanText(data.teamName, 30);
  if (teamName.length < 3 || !TEAM_RE.test(teamName)) return { ok: false, error: "incompleto" };
  if (isOffensive(teamName)) return { ok: false, error: "ofensivo" };

  if (!Array.isArray(data.players) || data.players.length < 3 || data.players.length > 4) {
    return { ok: false, error: "incompleto" };
  }

  var players = [];
  for (var index = 0; index < data.players.length; index++) {
    var player = data.players[index] || {};
    var name = cleanText(player.name, 80);
    var rut = formatRut(player.rut);
    if (!isPersonName(name)) return { ok: false, error: "incompleto" };
    if (!rut || !isValidRut(player.rut)) return { ok: false, error: "rut" };
    players.push({ name: name, rut: rut });
  }

  var keys = players.map(function (player) { return normalizeRut(player.rut); });
  if (unique(keys).length !== keys.length) return { ok: false, error: "repetido" };

  var whatsapp = normalizePhone(data.whatsapp);
  if (!whatsapp) return { ok: false, error: "whatsapp" };
  return { ok: true, teamName: teamName, players: players, whatsapp: whatsapp };
}

function getSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName("Inscripciones");
  if (!sheet) sheet = ss.insertSheet("Inscripciones");
  var first = String(sheet.getRange(1, 1).getValue() || "");
  if (first !== "Fecha") {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["reservado", "pagado", "liberado"], true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, 13, 500, 1).setDataValidation(rule);
  }
  return sheet;
}

function readRows(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).filter(function (row) { return String(row[1] || row[2] || "").trim(); });
}

function listTeams() {
  return listTeamsFromRows(readRows(getSheet()));
}

function listTeamsFromRows(rows) {
  return rows.filter(function (row) { return occupies(row[12]); }).map(function (row) {
    return String(row[2] || "").trim();
  }).filter(Boolean);
}

function occupies(status) {
  var value = String(status || "").trim().toLowerCase();
  return value === "reservado" || value === "pagado";
}

function uniqueCode(rows) {
  var used = {};
  rows.forEach(function (row) { used[String(row[1] || "")] = true; });
  var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (var attempt = 0; attempt < 8; attempt++) {
    var code = "";
    for (var index = 0; index < 6; index++) {
      code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    if (!used[code]) return code;
  }
  throw new Error("codigo");
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function cleanText(value, max) {
  var text = String(value || "").replace(/[\u0000-\u001F]/g, "").trim().replace(/\s+/g, " ");
  return text.length > max ? "" : text;
}

function safeCell(value) {
  var text = String(value || "");
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function isPersonName(value) {
  var parts = String(value || "").split(" ");
  if (parts.length < 2 || String(value || "").length > 80) return false;
  return parts.every(function (part) { return part.length >= 2 && NAME_PART.test(part); });
}

function normalizeRut(value) {
  return String(value || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

function formatRut(value) {
  var clean = normalizeRut(value);
  if (clean.length < 2) return "";
  var body = clean.slice(0, -1);
  var dv = clean.slice(-1);
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
}

function isValidRut(value) {
  var clean = normalizeRut(value);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  return rutDv(clean.slice(0, -1)) === clean.slice(-1);
}

function rutDv(body) {
  var sum = 0;
  var factor = 2;
  for (var index = body.length - 1; index >= 0; index--) {
    sum += Number(body.charAt(index)) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  var rest = 11 - (sum % 11);
  if (rest === 11) return "0";
  if (rest === 10) return "K";
  return String(rest);
}

function normalizePhone(value) {
  var digits = String(value || "").replace(/\D/g, "");
  if (digits.indexOf("56") === 0 && digits.length >= 11) digits = digits.slice(2);
  if (digits.length === 9 && digits.charAt(0) === "9") {
    return "+56 " + digits.charAt(0) + " " + digits.slice(1, 5) + " " + digits.slice(5);
  }
  return "";
}

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeForModeration(value) {
  var leet = { "4": "a", "3": "e", "1": "i", "0": "o", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };
  var lower = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  var mapped = lower.split("").map(function (char) { return leet[char] || char; }).join("");
  return mapped.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function collapseRuns(value) {
  return String(value || "").replace(/(.)\1+/g, "$1");
}

function isOffensive(value) {
  var spaced = normalizeForModeration(value);
  if (!spaced) return false;
  var parts = spaced.split(" ");
  var squeezed = collapseRuns(parts.join("").replace(/\d/g, ""));
  var candidates = {};
  candidates[squeezed] = true;
  parts.forEach(function (part) {
    var bare = part.replace(/\d/g, "");
    candidates[part] = true;
    candidates[collapseRuns(part)] = true;
    candidates[bare] = true;
    candidates[collapseRuns(bare)] = true;
  });
  var keys = Object.keys(candidates);
  for (var index = 0; index < keys.length; index++) {
    if (BLOCKED_TOKENS.indexOf(keys[index]) !== -1) return true;
  }
  return BLOCKED_PHRASES.some(function (phrase) { return squeezed.indexOf(phrase) !== -1; });
}

function unique(items) {
  var seen = {};
  return items.filter(function (item) {
    if (seen[item]) return false;
    seen[item] = true;
    return true;
  });
}
