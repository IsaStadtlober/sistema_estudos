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
})();