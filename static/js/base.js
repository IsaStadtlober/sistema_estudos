(function () {
    'use strict';

    var root = document.documentElement;

    // Alternar tema claro/escuro (persistido no navegador)
    var toggle = document.getElementById('themeToggleBtn');
    if (toggle) {
        toggle.addEventListener('click', function () {
            var escuro = !root.classList.contains('dark');
            root.classList.toggle('dark', escuro);
            try { localStorage.setItem('estudopro_theme', escuro ? 'dark' : 'light'); } catch (e) {}
            window.dispatchEvent(new Event('themechange'));
        });
    }

    // Sidebar no celular
    var sidebar = document.getElementById('sidebar');
    var abrir = document.getElementById('openSidebarBtn');
    var fechar = document.getElementById('closeSidebarBtn');
    if (abrir) abrir.addEventListener('click', function () { sidebar.classList.remove('-translate-x-full'); });
    if (fechar) fechar.addEventListener('click', function () { sidebar.classList.add('-translate-x-full'); });

    // POST em JSON com token CSRF. Rejeita com Error(mensagem) quando a API devolve erro.
    function csrf() {
        var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    }
    window.apiPost = function (url, corpo) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf(), 'Accept': 'application/json' },
            body: JSON.stringify(corpo || {})
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok) throw new Error(d.erro || ('Erro ' + r.status));
                return d;
            });
        });
    };

    // Aviso para ações que ainda não existem (some sozinho).
    // Os números nos templates foram escritos para o plano antigo; este mapa os atualiza.
    var LOTE = { 5: 6, 6: 7 };
    window.emBreve = function (lote) {
        var t = document.getElementById('toastEmBreve');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toastEmBreve';
            t.className = 'fixed bottom-4 right-4 z-[60] max-w-xs bg-gray-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg transition-opacity duration-300 opacity-0 pointer-events-none';
            document.body.appendChild(t);
        }
        t.textContent = 'Esta ação será ativada no Lote ' + (LOTE[lote] || lote) + '.';
        t.classList.remove('opacity-0');
        clearTimeout(t._h);
        t._h = setTimeout(function () { t.classList.add('opacity-0'); }, 2600);
    };

    document.querySelectorAll('[data-em-breve]').forEach(function (n) {
        var evento = n.tagName === 'FORM' ? 'submit' : 'click';
        n.addEventListener(evento, function (e) {
            e.preventDefault();
            window.emBreve(n.getAttribute('data-em-breve'));
        });
    });
})();