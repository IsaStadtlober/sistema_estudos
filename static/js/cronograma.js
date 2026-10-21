/* Cronograma em calendário.
   - Dias passados: lançamentos reais do banco.
   - Hoje e futuro: plano PROVISÓRIO (rodízio ponderado por peso). O motor final chega no Lote 5. */
(function () {
    'use strict';

    var D = JSON.parse(document.getElementById('dados-cronograma').textContent);
    var $ = function (id) { return document.getElementById(id); };
    var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    var M = D.minutos;
    var M_TEORIA = Math.round(M * 0.40);
    var M_QUEST = Math.round(M * 0.35);
    var M_REV = M - M_TEORIA - M_QUEST;
    var N_QUEST = Math.max(5, Math.floor(M_QUEST / 3));

    function pad(n) { return String(n).padStart(2, '0'); }
    function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function somar(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function wd(d) { return (d.getDay() + 6) % 7; } // 0 = segunda
    function br(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }

    // ----- Plano provisório: um tópico novo de teoria por dia de estudo -----
    var PLANO = {};
    (function gerar() {
        var fila = D.disciplinas.map(function (d) { return { d: d, itens: d.pendentes.slice(), cred: 0 }; })
            .filter(function (x) { return x.itens.length; });
        var dia = parse(D.hoje), limite = 400;
        while (limite-- > 0 && fila.length) {
            if (D.dias_ativos.indexOf(wd(dia)) !== -1) {
                var total = 0, melhor = null;
                fila.forEach(function (x) { x.cred += x.d.peso; total += x.d.peso; });
                fila.forEach(function (x) { if (!melhor || x.cred > melhor.cred) melhor = x; });
                melhor.cred -= total;
                PLANO[iso(dia)] = { disc: melhor.d, topico: melhor.itens.shift() };
                if (!melhor.itens.length) fila = fila.filter(function (x) { return x !== melhor; });
            }
            dia = somar(dia, 1);
        }
    })();

    // ----- Estado -----
    var visao = 'mes';
    var ref = parse(D.hoje);
    var sel = D.hoje;

    function info(d) {
        var k = iso(d);
        var apos = !!(D.prova && k > D.prova);
        return {
            d: d, iso: k,
            hoje: k === D.hoje,
            prova: k === D.prova,
            passado: k < D.hoje,
            folga: D.dias_ativos.indexOf(wd(d)) === -1,
            reg: D.historico[k] || [],
            plano: (k >= D.hoje && !apos) ? (PLANO[k] || null) : null
        };
    }

    // ----- Células -----
    function bloco(nome, cor, sub, cls) {
        return '<div class="mt-1"><div class="text-[10px] font-semibold ' + cls + '" style="color:' + esc(cor) + '">' + esc(nome) + '</div>' +
            '<div class="text-[9px] text-gray-400 ' + cls + '">' + esc(sub) + '</div></div>';
    }

    function conteudo(o, grande) {
        var cls = grande ? '' : 'truncate';
        if (o.prova) return '<span class="text-[10px] text-amber-700 dark:text-amber-300">Dia da prova</span>';
        if (o.plano) return bloco(o.plano.disc.nome, o.plano.disc.cor, o.plano.topico, cls);
        if (o.reg.length) {
            var r = o.reg[0];
            return bloco(r.disciplina, r.cor, o.reg.length > 1 ? o.reg.length + ' sessões de questões' : r.acertos + '/' + r.total + ' questões', cls);
        }
        if (o.folga) return '<span class="text-[10px] text-gray-400">Folga</span>';
        return '';
    }

    function marcadores(o) {
        var m = '';
        if (o.hoje) m += '<span class="w-2 h-2 rounded-full bg-indigo-600"></span>';
        if (o.prova) m += '<span class="text-[10px] bg-amber-500 text-white font-bold px-1 rounded">PROVA</span>';
        if ((o.passado || o.hoje) && o.reg.length) m += '<i class="fa-solid fa-circle-check text-emerald-500 text-[11px]"></i>';
        return m;
    }

    function classes(o, fora, selecionado, lista) {
        var c = 'rounded-xl border text-xs cursor-pointer transition-all ' +
            (lista ? 'flex items-center gap-3 p-3 ' : 'p-2 flex flex-col justify-between ');
        if (o.hoje) c += 'bg-indigo-50 border-indigo-500 dark:bg-indigo-950/60 font-bold';
        else if (o.prova) c += 'bg-amber-100 border-amber-500 dark:bg-amber-950/60 font-bold';
        else if (o.folga) c += 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60';
        else c += 'bg-white dark:bg-gray-700/40 border-gray-200 dark:border-gray-700 hover:border-indigo-400';
        if (fora) c += ' opacity-40';
        if (selecionado) c += ' ring-2 ring-indigo-400';
        return c;
    }

    // ----- Intervalo exibido -----
    function intervalo() {
        if (visao === 'semana') return { ini: somar(ref, -wd(ref)), n: 7, mes: null };
        var prim = new Date(ref.getFullYear(), ref.getMonth(), 1);
        var dias = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        return { ini: somar(prim, -wd(prim)), n: Math.ceil((wd(prim) + dias) / 7) * 7, mes: ref.getMonth() };
    }

    function render() {
        var r = intervalo(), grade = '', lista = '', grande = visao === 'semana';
        for (var i = 0; i < r.n; i++) {
            var d = somar(r.ini, i), o = info(d);
            var fora = r.mes !== null && d.getMonth() !== r.mes;
            var s = o.iso === sel;

            grade += '<div data-iso="' + o.iso + '" class="' + classes(o, fora, s, false) + (grande ? ' min-h-[150px]' : ' min-h-[84px]') + '">' +
                '<div class="flex items-center justify-between"><span class="' + (o.hoje ? 'text-indigo-600 dark:text-indigo-400' : '') + '">' + d.getDate() + '</span>' +
                '<span class="flex items-center gap-1">' + marcadores(o) + '</span></div>' + conteudo(o, grande) + '</div>';

            if (!fora) {
                lista += '<div data-iso="' + o.iso + '" class="' + classes(o, false, s, true) + '">' +
                    '<div class="w-12 text-center"><div class="text-[10px] uppercase text-gray-400">' + DIAS[wd(d)] + '</div><div class="text-base">' + d.getDate() + '</div></div>' +
                    '<div class="flex-1 min-w-0">' + conteudo(o, false) + '</div>' +
                    '<span class="flex items-center gap-1">' + marcadores(o) + '</span></div>';
            }
        }
        $('cronoCalendarGrid').innerHTML = grade;
        $('cronoList').innerHTML = lista;

        $('cronoMonthTitle').textContent = grande
            ? br(r.ini).slice(0, 5) + ' – ' + br(somar(r.ini, 6))
            : MESES[ref.getMonth()] + ' ' + ref.getFullYear();

        var on = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-white';
        var off = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300';
        $('cronoBtnMonthView').className = grande ? off : on;
        $('cronoBtnWeekView').className = grande ? on : off;

        drawer();
    }

    // ----- Painel do dia -----
    function card(cor, titulo, linha1, linha2) {
        var t = {
            blue: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
            green: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
            purple: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
            gray: 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300',
            amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
        }[cor];
        return '<div class="p-3 rounded-xl border ' + t + '"><div class="font-bold">' + esc(titulo) + '</div>' +
            '<div class="font-semibold text-gray-800 dark:text-gray-200 mt-1">' + esc(linha1) + '</div>' +
            (linha2 ? '<div class="text-gray-500 dark:text-gray-400 text-[11px]">' + esc(linha2) + '</div>' : '') + '</div>';
    }

    function drawer() {
        var o = info(parse(sel)), cards = '';
        var st = $('cronoDrawerStatus');
        function status(txt, cor) { st.textContent = txt; st.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full ' + cor; }

        $('cronoDrawerTitle').textContent = 'Detalhes do Dia: ' + br(o.d) + ' (' + DIAS[wd(o.d)] + ')';

        if (o.prova) {
            status('Dia da Prova', 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300');
            cards = card('amber', 'Dia da prova', D.prova ? br(parse(D.prova)) : '', 'Boa prova!');
        } else {
            if (o.hoje) status('Hoje', 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300');
            else if (o.passado && o.reg.length) status('Dia Concluído', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300');
            else if (o.passado) status(o.folga ? 'Folga' : 'Sem registro', 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300');
            else if (o.folga) status('Folga', 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300');
            else status('Planejado', 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300');

            if (o.plano) {
                cards += card('blue', 'Teoria (' + M_TEORIA + ' min)', o.plano.disc.nome, o.plano.topico);
                cards += card('green', 'Questões (' + M_QUEST + ' min)', N_QUEST + ' questões no QConcursos', 'Disciplina: ' + o.plano.disc.nome);
                cards += card('purple', 'Revisão Espaçada (' + M_REV + ' min)', 'Revisões dos ciclos de 1, 7, 15 e 30 dias', 'Lista exata calculada no Lote 5');
            }
            o.reg.forEach(function (r) {
                var pct = Math.round(r.acertos / r.total * 100);
                cards += card('gray', 'Lançado: ' + r.acertos + '/' + r.total + ' (' + pct + '%)', r.disciplina, r.topico);
            });
            if (!cards) {
                cards = card('gray', o.folga ? 'Dia de folga' : 'Sem tópico planejado', o.folga ? 'Descanso.' : 'Nada previsto para este dia.', '');
            }
        }
        $('cronoDrawerContent').innerHTML = cards;
    }

    // ----- Legenda -----
    $('cronoLegend').innerHTML = D.disciplinas.map(function (d) {
        return '<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background-color:' + esc(d.cor) + '"></span>' + esc(d.nome) + '</span>';
    }).join('');

    // ----- Eventos -----
    function selecionar(e) {
        var n = e.target.closest('[data-iso]');
        if (!n) return;
        sel = n.getAttribute('data-iso');
        var d = parse(sel);
        if (visao === 'mes' && d.getMonth() !== ref.getMonth()) ref = d;
        render();
    }
    function mover(s) {
        ref = visao === 'semana' ? somar(ref, 7 * s) : new Date(ref.getFullYear(), ref.getMonth() + s, 1);
        render();
    }
    $('cronoCalendarGrid').addEventListener('click', selecionar);
    $('cronoList').addEventListener('click', selecionar);
    $('cronoPrev').addEventListener('click', function () { mover(-1); });
    $('cronoNext').addEventListener('click', function () { mover(1); });
    $('cronoBtnMonthView').addEventListener('click', function () { visao = 'mes'; render(); });
    $('cronoBtnWeekView').addEventListener('click', function () { visao = 'semana'; render(); });

    render();
})();