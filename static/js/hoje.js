(function () {
    'use strict';

    // Marcar ou desmarcar um item do plano do dia
    document.querySelectorAll('[data-concluir]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-concluir');
            var concluir = b.getAttribute('data-estado') !== '1';
            b.disabled = true;
            window.apiPost('/api/cronograma/item/' + id + '/concluir/', { concluido: concluir })
                .then(function () { window.location.reload(); })
                .catch(function (err) { b.disabled = false; window.alert(err.message); });
        });
    });
})();