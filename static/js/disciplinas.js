/* Tela de Disciplinas: cadastro, edição e exclusão de disciplinas e tópicos. */
(function () {
    'use strict';

    var D = JSON.parse(document.getElementById('dados-disciplinas').textContent);
    var $ = function (id) { return document.getElementById(id); };
    var ABERTAS = new Set();
    var PALETA = ['#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#eab308', '#f97316', '#ef4444',
                  '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#64748b', '#d946ef'];

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
    function achar(id) { return D.disciplinas.filter(function (d) { return String(d.id) === String(id); })[0]; }
    function achaTopico(id) {
        for (var i = 0; i < D.disciplinas.length; i++) {
            var t = D.disciplinas[i].topicos.filter(function (x) { return String(x.id) === String(id); })[0];
            if (t) return t;
        }
        return null;
    }

    var BTN = 'w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs flex-none';
    function botao(acao, id, icone, titulo, extra) {
        return '<button type="button" data-acao="' + acao + '" data-id="' + id + '" title="' + titulo + '" class="' + BTN + (extra || '') + '"><i class="fa-solid ' + icone + '"></i></button>';
    }

    // ----- renderização -----
    function corpo(d) {
        var h = '<div class="border-t border-gray-100 dark:border-gray-700 p-4 space-y-2 text-xs">';
        h += d.topicos.length ? d.topicos.map(function (t) {
            return '<div class="flex items-center gap-2 p-2.5 bg-gray-50/60 dark:bg-gray-700/30 rounded-xl">' +
                '<span class="flex-1 min-w-0 text-gray-800 dark:text-gray-200">' + esc(t.nome) + '</span>' +
                (t.n_lancamentos ? '<span class="text-[10px] text-gray-400 flex-none">' + plural(t.n_lancamentos, 'lançamento', 'lançamentos') + '</span>' : '') +
                botao('editar-top', t.id, 'fa-pen', 'Renomear tópico') +
                botao('excluir-top', t.id, 'fa-trash', 'Excluir tópico', ' hover:text-rose-600') + '</div>';
        }).join('') : '<p class="text-gray-400">Nenhum tópico ainda.</p>';
        h += '<form data-form-topico="' + d.id + '" class="flex gap-2 pt-2">' +
            '<input type="text" maxlength="200" placeholder="Novo tópico" class="flex-1 min-w-0 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">' +
            '<button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 rounded-xl">Adicionar</button></form></div>';
        return h;
    }

    function cartao(d) {
        var aberta = ABERTAS.has(d.id);
        return '<div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">' +
            '<div class="p-4 flex flex-wrap items-center gap-3">' +
            '<button type="button" data-acao="abrir" data-id="' + d.id + '" class="flex items-center gap-3 flex-1 min-w-[200px] text-left">' +
            '<span class="w-4 h-4 rounded-full flex-none" style="background-color:' + esc(d.cor) + '"></span>' +
            '<span class="min-w-0"><span class="block font-bold text-sm text-gray-900 dark:text-white">' + esc(d.nome) + '</span>' +
            '<span class="block text-[11px] text-gray-500 dark:text-gray-400">' + plural(d.n_topicos, 'tópico', 'tópicos') + ' · ' +
            plural(d.n_lancamentos, 'lançamento', 'lançamentos') + ' · ' + plural(d.n_itens, 'item no cronograma', 'itens no cronograma') + '</span></span></button>' +
            '<span class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded">' + esc(d.sigla) + '</span>' +
            (d.peso
                ? '<span class="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded">Peso ' + d.peso + '</span>'
                : '<span class="bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded">Sem peso</span>') +
            botao('editar-disc', d.id, 'fa-pen', 'Editar disciplina') +
            botao('excluir-disc', d.id, 'fa-trash', 'Excluir disciplina', ' hover:text-rose-600') +
            botao('abrir', d.id, aberta ? 'fa-chevron-up' : 'fa-chevron-down', aberta ? 'Recolher tópicos' : 'Ver tópicos') +
            '</div>' + (aberta ? corpo(d) : '') + '</div>';
    }

    function render() {
        $('discLista').innerHTML = D.disciplinas.length
            ? D.disciplinas.map(cartao).join('')
            : '<div class="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm text-gray-500 text-center">Nenhuma disciplina neste concurso. Clique em <strong>Nova disciplina</strong> ou importe um plano na tela Cronograma.</div>';
    }

    function recarregar() {
        return fetch('/api/disciplinas/', { headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) { D = d; render(); });
    }

    // ----- modal da disciplina -----
    function abrir() { $('modalDisc').classList.remove('hidden'); }
    function fechar() { $('modalDisc').classList.add('hidden'); }
    function erro(msg) { $('discErro').textContent = msg; $('discErro').classList.remove('hidden'); }

    function corLivre() {
        var usadas = D.disciplinas.map(function (d) { return d.cor.toLowerCase(); });
        return PALETA.filter(function (c) { return usadas.indexOf(c) === -1; })[0] || PALETA[D.disciplinas.length % PALETA.length];
    }

    function abrirDisc(d) {
        $('discErro').classList.add('hidden');
        $('discModalTitulo').textContent = d ? 'Editar disciplina' : 'Nova disciplina';
        $('discId').value = d ? d.id : '';
        $('discNome').value = d ? d.nome : '';
        $('discPeso').value = d && d.peso ? d.peso : '';
        $('discCor').value = d ? d.cor : corLivre();
        $('discSigla').value = d ? d.sigla : '';
        abrir();
        $('discNome').focus();
    }

    $('btnNovaDisc').addEventListener('click', function () { abrirDisc(null); });
    $('btnFecharDisc').addEventListener('click', fechar);
    $('btnCancelarDisc').addEventListener('click', fechar);
    $('modalDisc').addEventListener('click', function (e) { if (e.target === this) fechar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });

    $('formDisc').addEventListener('submit', function (e) {
        e.preventDefault();
        window.apiPost('/api/disciplinas/salvar/', {
            id: $('discId').value || null,
            nome: $('discNome').value,
            peso: $('discPeso').value,
            cor: $('discCor').value,
            sigla: $('discSigla').value
        }).then(function (r) {
            fechar();
            ABERTAS.add(r.id);
            return recarregar();
        }).catch(function (err) { erro(err.message); });
    });

    // ----- exclusões -----
    function excluirDisc(d) {
        var msg = 'Excluir a disciplina "' + d.nome + '"?\n\nSerão removidos: ' +
            plural(d.n_topicos, 'tópico', 'tópicos') + ' e ' + plural(d.n_itens, 'item do cronograma', 'itens do cronograma') + '.';
        if (d.n_lancamentos) {
            msg += '\n\nATENÇÃO: o histórico de ' + plural(d.n_lancamentos, 'lançamento', 'lançamentos') +
                ' de questões desta disciplina também será apagado. Se só quer corrigir o nome, use Editar.';
        }
        if (!window.confirm(msg)) return;
        if (d.n_lancamentos && !window.confirm('Tem certeza? Os gráficos e estatísticas do Dashboard vão mudar e isso não pode ser desfeito.')) return;
        window.apiPost('/api/disciplinas/' + d.id + '/excluir/', { apagar_historico: d.n_lancamentos > 0 })
            .then(recarregar)
            .catch(function (err) { window.alert(err.message); });
    }

    function excluirTopico(t) {
        var msg = 'Excluir o tópico "' + t.nome + '"?\n\nItens do cronograma ligados a ele também serão removidos.';
        if (t.n_lancamentos) {
            msg += '\n\nATENÇÃO: ' + plural(t.n_lancamentos, 'lançamento', 'lançamentos') + ' de questões deste tópico serão apagados.';
        }
        if (!window.confirm(msg)) return;
        window.apiPost('/api/topicos/' + t.id + '/excluir/', { apagar_historico: t.n_lancamentos > 0 })
            .then(recarregar)
            .catch(function (err) { window.alert(err.message); });
    }

    // ----- eventos da lista -----
    $('discLista').addEventListener('click', function (e) {
        var b = e.target.closest('[data-acao]');
        if (!b) return;
        var acao = b.getAttribute('data-acao'), id = b.getAttribute('data-id');
        if (acao === 'abrir') {
            var n = Number(id);
            if (ABERTAS.has(n)) ABERTAS.delete(n); else ABERTAS.add(n);
            render();
        } else if (acao === 'editar-disc') {
            abrirDisc(achar(id));
        } else if (acao === 'excluir-disc') {
            excluirDisc(achar(id));
        } else if (acao === 'editar-top') {
            var t = achaTopico(id);
            var nome = t && window.prompt('Novo nome do tópico:', t.nome);
            if (nome === null || nome === false || nome === undefined || nome === '') return;
            window.apiPost('/api/topicos/salvar/', { id: id, nome: nome })
                .then(recarregar)
                .catch(function (err) { window.alert(err.message); });
        } else if (acao === 'excluir-top') {
            excluirTopico(achaTopico(id));
        }
    });

    $('discLista').addEventListener('submit', function (e) {
        var f = e.target.closest('[data-form-topico]');
        if (!f) return;
        e.preventDefault();
        var campo = f.querySelector('input'), nome = campo.value.trim();
        if (!nome) return;
        window.apiPost('/api/topicos/salvar/', { disciplina_id: f.getAttribute('data-form-topico'), nome: nome })
            .then(recarregar)
            .then(function () {
                var novo = document.querySelector('[data-form-topico="' + f.getAttribute('data-form-topico') + '"] input');
                if (novo) novo.focus();
            })
            .catch(function (err) { window.alert(err.message); });
    });

    render();
})();