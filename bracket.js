(function (root) {
  var GAMES = [
    { id: "p1", label: "Preliminar 1", time: "13:45", a: "los mascapitos", b: "abelsitos" },
    { id: "p2", label: "Preliminar 2", time: "14:00", a: "True wings", b: "Los proyectados" },
    { id: "p3", label: "Preliminar 3", time: "14:15", a: "Los cuatro ñemasticos", b: "los alfa" },
    { id: "q1", label: "Cuarto 1", time: "14:30", a: "papoi", bFrom: "p1", bPending: "Ganador preliminar" },
    { id: "q2", label: "Cuarto 2", time: "14:45", a: "RealG4life", bFrom: "p2", bPending: "Ganador preliminar" },
    { id: "q3", label: "Cuarto 3", time: "15:00", a: "Mamba Legacy", bFrom: "p3", bPending: "Ganador preliminar" },
    { id: "q4", label: "Cuarto 4", time: "15:15", a: "bassquad", b: "kerry capo" },
    { id: "s1", label: "Semi 1", time: "15:30", aFrom: "q1", bFrom: "q2", aPending: "Ganador cuarto 1", bPending: "Ganador cuarto 2" },
    { id: "s2", label: "Semi 2", time: "15:45", aFrom: "q3", bFrom: "q4", aPending: "Ganador cuarto 3", bPending: "Ganador cuarto 4" },
    { id: "f", label: "Final", time: "16:00", aFrom: "s1", bFrom: "s2", aPending: "Ganador semi 1", bPending: "Ganador semi 2" }
  ];

  function scoreOf(results, id) {
    var row = results && results[id];
    if (!row) return null;
    var a = Number(row.a);
    var b = Number(row.b);
    if (!isValidScore(a) || !isValidScore(b) || a === b) return null;
    return { a: a, b: b };
  }

  function isValidScore(value) {
    return Number.isInteger(value) && value >= 0 && value <= 50;
  }

  function build(results) {
    var winners = {};
    return GAMES.map(function (game) {
      var aName = game.a || winners[game.aFrom] || null;
      var bName = game.b || winners[game.bFrom] || null;
      var ready = Boolean(aName && bName);
      var score = ready ? scoreOf(results, game.id) : null;
      var winner = score ? (score.a > score.b ? aName : bName) : null;
      if (winner) winners[game.id] = winner;
      return {
        id: game.id,
        label: game.label,
        time: game.time,
        a: aName || game.aPending || "Por definir",
        b: bName || game.bPending || "Por definir",
        aReady: Boolean(aName),
        bReady: Boolean(bName),
        ready: ready,
        score: score,
        winner: winner
      };
    });
  }

  function fold(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function teamNames(games) {
    var names = [];
    games.forEach(function (game) {
      if (game.aReady && names.indexOf(game.a) === -1) names.push(game.a);
      if (game.bReady && names.indexOf(game.b) === -1) names.push(game.b);
    });
    return names;
  }

  function findTeams(games, query) {
    var needle = fold(query);
    if (needle.length < 2) return [];
    return teamNames(games).filter(function (name) {
      return fold(name).indexOf(needle) !== -1;
    });
  }

  root.TORNEO_BRACKET = {
    build: build,
    findTeams: findTeams,
    fold: fold
  };

  if (typeof module !== "undefined" && module.exports) module.exports = root.TORNEO_BRACKET;
})(typeof window !== "undefined" ? window : globalThis);
