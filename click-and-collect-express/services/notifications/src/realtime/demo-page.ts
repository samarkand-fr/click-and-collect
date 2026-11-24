// =====================================================================
//  Page de démonstration temps réel servie sur GET /demo :
//    - panneau "Cuisine" : room globale `kitchen` (toutes les commandes)
//    - panneau "Client"  : room `order_<id>` (suivi d'une commande)
//  Deux connexions Socket.io distinctes pour matérialiser les rooms.
//
//  Compatible proxy gateway : si la page est chargée avec
//  ?XTransformPort=<port>, les URLs socket/fetch sont réécrites via les
//  placeholders %%IO_URL%% / %%XTPQ%% / %%SOCKET_SRC%% (injectés par la
//  route /demo — voir routes/notification.routes.ts).
// =====================================================================

export const DEMO_PAGE_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Click &amp; Collect — démo temps réel</title>
<style>
  :root { color-scheme: dark; --ok:#15803d; --warn:#b45309; --bad:#b91c1c; --card:#1e293b; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; padding:16px; }
  h1 { font-size:1.25rem; margin:0 0 4px; }
  .sub { color:#94a3b8; font-size:.85rem; margin-bottom:16px; }
  .grid { display:grid; gap:16px; grid-template-columns:1fr; }
  @media (min-width: 900px) { .grid { grid-template-columns:1fr 1fr; } }
  section { background:var(--card); border-radius:12px; padding:16px; }
  h2 { font-size:1rem; margin:0 0 12px; }
  .row { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center; }
  input { flex:1; min-width:140px; padding:8px 10px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; }
  button { padding:8px 14px; border-radius:8px; border:0; background:#e11d48; color:white; font-weight:600; cursor:pointer; }
  button.secondary { background:#334155; }
  ul { list-style:none; margin:0; padding:0; max-height:320px; overflow-y:auto; }
  li { background:#0f172a; border-radius:8px; padding:8px 10px; margin-bottom:8px; font-size:.85rem; display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .badge { padding:2px 8px; border-radius:999px; font-size:.72rem; font-weight:700; }
  .PENDING { background:#334155; color:#cbd5e1; } .PAID { background:var(--warn); color:white; }
  .PREPARING { background:#7c2d12; color:#fed7aa; } .READY { background:var(--ok); color:white; }
  .CANCELLED { background:var(--bad); color:white; }
  .muted { color:#94a3b8; font-size:.75rem; }
  code { color:#fda4af; }
  .log { font-family:ui-monospace, monospace; font-size:.72rem; color:#94a3b8; max-height:120px; overflow-y:auto; background:#020617; border-radius:8px; padding:8px; }
</style>
</head>
<body>
<h1>Click &amp; Collect — démo Socket.io</h1>
<p class="sub">Deux connexions : la room globale <code>kitchen</code> (écran cuisine) et la room <code>order_&lt;id&gt;</code> (suivi client). Événement diffusé : <code>order.status_updated</code>.</p>
<div class="grid">
  <section>
    <h2>Écran cuisine — room <code>kitchen</code></h2>
    <ul id="kitchen-list"><li class="muted">En attente d'événements…</li></ul>
    <p class="muted">Toutes les commandes, poussées en direct par notification-service.</p>
  </section>
  <section>
    <h2>Suivi client — room <code>order_&lt;id&gt;</code></h2>
    <div class="row">
      <input id="order-id" placeholder="ID de commande" />
      <button id="btn-join">Suivre</button>
    </div>
    <div class="row">
      <button id="btn-sim" class="secondary">Simuler une mise à jour</button>
      <span class="muted" id="joined-label"></span>
    </div>
    <ul id="client-list"><li class="muted">Rejoignez une commande pour voir son historique…</li></ul>
    <div class="log" id="log">— journal socket —</div>
  </section>
</div>
<script src="%%SOCKET_SRC%%"></script>
<script>
(function () {
  window.CNC_XTPQ = '%%XTPQ%%';
  window.CNC_IO_URL = '%%IO_URL%%';
  var IO_URL = window.CNC_IO_URL || undefined;
  var STATUSES = ['PENDING', 'PAID', 'PREPARING', 'READY', 'CANCELLED'];
  var currentOrderId = null;

  function log(msg) {
    var box = document.getElementById('log');
    var line = document.createElement('div');
    line.textContent = new Date().toLocaleTimeString() + ' — ' + msg;
    box.prepend(line);
  }
  function fmtAmount(cents) { return (cents / 100).toFixed(2) + ' €'; }
  function row(event) {
    var li = document.createElement('li');
    var left = document.createElement('div');
    left.innerHTML = '<strong>' + event.customerName + '</strong><br><span class="muted">' +
      String(event.orderId).slice(0, 8) + '… · ' + fmtAmount(event.totalAmount) + '</span>';
    var right = document.createElement('div');
    right.innerHTML = '<span class="badge ' + event.status + '">' + event.status + '</span>';
    li.appendChild(left); li.appendChild(right);
    return li;
  }
  function prepend(listId, node) {
    var list = document.getElementById(listId);
    if (list.children.length === 1 && list.firstElementChild.classList.contains('muted')) list.innerHTML = '';
    list.prepend(node);
    while (list.children.length > 25) list.removeChild(list.lastElementChild);
  }

  // ── Connexion cuisine (room globale) ───────────────────────────────────────
  var kitchen = IO_URL ? io(IO_URL) : io();
  kitchen.on('connect', function () {
    log('socket cuisine connecté (' + kitchen.id + ')');
    kitchen.emit('room:join', 'kitchen', function (r) {
      log('room:join kitchen → ' + JSON.stringify(r));
    });
  });
  kitchen.on('order.status_updated', function (e) { prepend('kitchen-list', row(e)); });

  // ── Connexion client (room commande) ───────────────────────────────────────
  var client = IO_URL ? io(IO_URL) : io();
  client.on('connect', function () { log('socket client connecté (' + client.id + ')'); });
  client.on('room:joined', function (r) { log('room:joined → ' + r.room); });
  client.on('order.status_updated', function (e) {
    if (e.orderId === currentOrderId) prepend('client-list', row(e));
  });

  // Historique initial (écran qui se (re)connecte)
  fetch('/events/recent%%XTPQ%%')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      (data.events || []).slice().forEach(function (stored) {
        prepend('kitchen-list', row(stored.payload));
      });
    })
    .catch(function () { log('historique indisponible'); });

  document.getElementById('btn-join').addEventListener('click', function () {
    var input = document.getElementById('order-id');
    var id = (input.value || '').trim();
    if (!id) { log('saisir un ID de commande'); return; }
    currentOrderId = id;
    client.emit('room:join', 'order_' + id, function (r) {
      log('room:join order_' + id + ' → ' + JSON.stringify(r));
      var label = document.getElementById('joined-label');
      label.textContent = r.ok ? ('room order_' + id + ' rejointe (' + r.clients + ' client(s))') : r.error;
    });
    document.getElementById('client-list').innerHTML = '<li class="muted">En attente de mises à jour pour ' + id + '…</li>';
    fetch('/events/recent%%XTPQ%%?orderId=' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        (data.events || []).forEach(function (stored) { prepend('client-list', row(stored.payload)); });
      });
  });

  // Simule une mise à jour via l'endpoint de test (même pipeline qu'un
  // événement RabbitMQ réel) puis suit automatiquement la commande.
  document.getElementById('btn-sim').addEventListener('click', function () {
    var nextIdx = Math.floor(Math.random() * (STATUSES.length - 2)) + 1;
    fetch('/__test/status-update%%XTPQ%%', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: currentOrderId || undefined,
        status: STATUSES[nextIdx],
        previousStatus: STATUSES[nextIdx - 1]
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.payload) {
          if (!currentOrderId) {
            document.getElementById('order-id').value = data.payload.orderId;
            document.getElementById('btn-join').click();
          }
          log('simulé → ' + data.payload.orderId.slice(0, 8) + '… → ' + data.payload.status);
        }
      })
      .catch(function () { log('échec de simulation (endpoint de test désactivé ?)'); });
  });
})();
</script>
</body>
</html>`;
