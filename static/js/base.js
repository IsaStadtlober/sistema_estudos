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

    // Aviso para ações que ainda não existem (some sozinho)
    window.emBreve = function (lote) {
        var t = document.getElementById('toastEmBreve');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toastEmBreve';
            t.className = 'fixed bottom-4 right-4 z-[60] max-w-xs bg-gray-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg transition-opacity duration-300 opacity-0 pointer-events-none';
            document.body.appendChild(t);
        }
        t.textContent = 'Esta ação será ativada no Lote ' + lote + '.';
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