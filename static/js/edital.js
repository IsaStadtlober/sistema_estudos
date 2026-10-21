(function () {
    'use strict';

    function norm(s) {
        return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    // Expandir / recolher disciplina
    document.querySelectorAll('[data-acc-toggle]').forEach(function (h) {
        h.addEventListener('click', function () {
            h.nextElementSibling.classList.toggle('hidden');
            var ic = h.querySelector('.chev');
            if (ic) ic.classList.toggle('rotate-180');
        });
    });

    // Busca de tópicos (ignora acentos e maiúsculas)
    var busca = document.getElementById('editalSearchInput');
    var vazio = document.getElementById('editalVazio');
    busca.addEventListener('input', function () {
        var termo = norm(busca.value.trim());
        var total = 0;
        document.querySelectorAll('.edital-disc').forEach(function (disc) {
            var achou = 0;
            disc.querySelectorAll('.edital-topico').forEach(function (t) {
                var ok = !termo || norm(t.getAttribute('data-nome')).indexOf(termo) !== -1;
                t.classList.toggle('hidden', !ok);
                if (ok) achou++;
            });
            disc.classList.toggle('hidden', !!termo && achou === 0);
            if (termo && achou) disc.querySelector('.edital-corpo').classList.remove('hidden');
            total += achou;
        });
        vazio.classList.toggle('hidden', !(termo && total === 0));
    });
})();