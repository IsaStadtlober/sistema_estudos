(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };

    // ----- rotina -----
    function aviso(texto, ok) {
        var el = $('rotMsg');
        el.textContent = texto;
        el.className = 'text-xs font-medium ' + (ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400');
    }

    $('formRotina').addEventListener('submit', function (e) {
        e.preventDefault();
        var dias = Array.prototype.map.call(
            document.querySelectorAll('input[name="dias"]:checked'),
            function (c) { return Number(c.value); }
        );
        window.apiPost('/api/ajustes/rotina/', { minutos: $('rotMin').value, dias: dias })
            .then(function () { aviso('Preferências salvas.', true); })
            .catch(function (err) { aviso(err.message, false); });
    });

    // ----- modal de concurso -----
    function abrir() { $('modalConc').classList.remove('hidden'); }
    function fechar() { $('modalConc').classList.add('hidden'); }

    function abrirConc(c) {
        $('concErro').classList.add('hidden');
        $('concModalTitulo').textContent = c ? 'Editar concurso' : 'Novo concurso';
        $('concId').value = c ? c.id : '';
        $('concNome').value = c ? c.nome : '';
        $('concData').value = c ? c.data : '';
        $('concAviso').classList.toggle('hidden', !!c);
        abrir();
        $('concNome').focus();
    }

    $('btnNovoConc').addEventListener('click', function () { abrirConc(null); });
    $('btnFecharConc').addEventListener('click', fechar);
    $('btnCancelarConc').addEventListener('click', fechar);
    $('modalConc').addEventListener('click', function (e) { if (e.target === this) fechar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });

    $('formConc').addEventListener('submit', function (e) {
        e.preventDefault();
        window.apiPost('/api/ajustes/concurso/', {
            id: $('concId').value || null,
            nome: $('concNome').value,
            data_prova: $('concData').value
        }).then(function () {
            window.location.reload(); // atualiza a lista, o menu lateral e a contagem da prova
        }).catch(function (err) {
            $('concErro').textContent = err.message;
            $('concErro').classList.remove('hidden');
        });
    });

    // ----- excluir -----
    function plural(n, um, varios) { return n + ' ' + (Number(n) === 1 ? um : varios); }

    function excluir(d) {
        var lanc = Number(d.lanc);
        var unico = document.querySelectorAll('#concList [data-id]').length === 1;
        var msg = 'Excluir o concurso "' + d.nome + '"?\n\nSerão removidos: ' + plural(d.disc, 'disciplina', 'disciplinas') +
            ' (com seus tópicos) e ' + plural(d.itens, 'item do cronograma', 'itens do cronograma') + '.';
        if (lanc) {
            msg += '\n\nATENÇÃO: ' + plural(lanc, 'lançamento', 'lançamentos') + ' de questões também serão apagados.';
        }
        if (unico) {
            msg += '\n\nEste é o seu único concurso. Depois de excluir, o sistema fica sem concurso até você criar outro em "Novo concurso".';
        }
        if (!window.confirm(msg)) return;
        if (lanc && !window.confirm('Tem certeza? Isso não pode ser desfeito e os gráficos do Dashboard vão mudar.')) return;
        window.apiPost('/api/ajustes/concurso/' + d.id + '/excluir/', { apagar_historico: lanc > 0 })
            .then(function () { window.location.reload(); })
            .catch(function (err) { window.alert(err.message); });
    }

    // ----- eventos da lista -----
    $('concList').addEventListener('click', function (e) {
        var b = e.target.closest('[data-acao]');
        if (!b) return;
        var d = b.closest('[data-id]').dataset;
        if (b.getAttribute('data-acao') === 'editar') abrirConc({ id: d.id, nome: d.nome, data: d.data });
        else excluir(d);
    });
})();