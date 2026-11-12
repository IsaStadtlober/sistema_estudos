/* Cronograma em calendário, 100% manual.
   Clique no item = editar; arrastar o item para outro dia = mover.
   Dias sem item ficam vazios: nada é sugerido automaticamente. */
(function () {
    'use strict';

    var D = JSON.parse(document.getElementById('dados-cronograma').textContent);
    var $ = function (id) { return document.getElementById(id); };
    var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    var TIPO = {
        teoria:   { nome: 'Teoria',   letra: 'T', card: 'blue',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300' },
        questoes: { nome: 'Questões', letra: 'Q', card: 'green',  badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300' },
        revisao:  { nome: 'Revisão',  letra: 'R', card: 'purple', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300' },
        simulado: { nome: 'Simulado', letra: 'S', card: 'amber',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300' }
    };
    var CARD = {
        blue: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
        green: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
        purple: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
        gray: 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300',
        amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
    };

    // ----- datas e texto -----
    function pad(n) { return String(n).padStart(2, '0'); }
    function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function somar(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function wd(d) { return (d.getDay() + 6) % 7; } // 0 = segunda
    function br(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }

    // ----- estado -----
    var visao = 'mes';
    var ref = parse(D.hoje);
    var sel = D.hoje;
    var POR = {};      // itens do plano por data
    var TEM = false;   // existe algum item cadastrado?
    var arrastando = null;

    function indexar() {
        POR = {};
        D.itens.forEach(function (it) { (POR[it.data] = POR[it.data] || []).push(it); });
        Object.keys(POR).forEach(function (k) {
            POR[k].sort(function (a, b) {
                var x = a.hora_inicio || '99:99', y = b.hora_inicio || '99:99';
                return x < y ? -1 : x > y ? 1 : 0;
            });
        });
        TEM = D.itens.length > 0;
    }

    function info(d) {
        var k = iso(d);
        return {
            d: d, iso: k,
            hoje: k === D.hoje,
            prova: k === D.prova,
            passado: k < D.hoje,
            folga: D.dias_ativos.indexOf(wd(d)) === -1,
            reg: D.historico[k] || [],
            itens: POR[k] || []
        };
    }

    // ----- conteúdo das células -----
    function hhmm(h) { return h ? h.replace(':', 'h') : ''; } // "21:45" -> "21h45"

    function linhaItem(it, cls) {
        var t = TIPO[it.tipo];
        var nome = it.disciplina || t.nome;
        var sub = t.nome + (it.topico ? ' · ' + it.topico : '');
        return '<div data-item="' + it.id + '" draggable="true" title="Clique para editar · arraste para outro dia" class="cursor-pointer ' + (it.concluido ? 'opacity-50 line-through' : '') + '">' +
            '<div class="text-[10px] font-semibold ' + cls + '"' + (it.cor ? ' style="color:' + esc(it.cor) + '"' : '') + '>' +
            (it.hora_inicio ? hhmm(it.hora_inicio) + ' · ' : '') + esc(nome) + '</div>' +
            '<div class="text-[9px] text-gray-400 ' + cls + '">' + esc(sub) + '</div></div>';
    }

    function bloco(nome, cor, sub, cls) {
        return '<div class="mt-1"><div class="text-[10px] font-semibold ' + cls + '" style="color:' + esc(cor) + '">' + esc(nome) + '</div>' +
            '<div class="text-[9px] text-gray-400 ' + cls + '">' + esc(sub) + '</div></div>';
    }

    function conteudo(o, grande) {
        var cls = grande ? '' : 'truncate';
        if (o.itens.length) {
            var max = grande ? 99 : 2, h = '<div class="mt-1 space-y-1.5">';
            o.itens.slice(0, max).forEach(function (it) { h += linhaItem(it, cls); });
            if (o.itens.length > max) h += '<div class="text-[9px] text-gray-400">+' + (o.itens.length - max) + ' mais</div>';
            return h + '</div>';
        }
        if (o.prova) return '<span class="text-[10px] text-amber-700 dark:text-amber-300">Dia da prova</span>';
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
        var todos = o.itens.length > 0 && o.itens.every(function (i) { return i.concluido; });
        if (todos || (!o.itens.length && (o.passado || o.hoje) && o.reg.length)) {
            m += '<i class="fa-solid fa-circle-check text-emerald-500 text-[11px]"></i>';
        }
        return m;
    }

    function classes(o, fora, selecionado, lista) {
        var c = 'rounded-xl border text-xs cursor-pointer transition-all ' +
            (lista ? 'flex items-center gap-3 p-3 ' : 'p-2 flex flex-col justify-between ');
        if (o.hoje) c += 'bg-indigo-50 border-indigo-500 dark:bg-indigo-950/60 font-bold';
        else if (o.prova) c += 'bg-amber-100 border-amber-500 dark:bg-amber-950/60 font-bold';
        else if (o.folga && !o.itens.length) c += 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60';
        else c += 'bg-white dark:bg-gray-700/40 border-gray-200 dark:border-gray-700 hover:border-indigo-400';
        if (fora) c += ' opacity-40';
        if (selecionado) c += ' ring-2 ring-indigo-400';
        return c;
    }

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
                    '<div class="w-12 text-center flex-none"><div class="text-[10px] uppercase text-gray-400">' + DIAS[wd(d)] + '</div><div class="text-base">' + d.getDate() + '</div></div>' +
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

        banner();
        legenda();
        drawer();
    }

    function banner() {
        var b = $('cronoBanner');
        if (!TEM) {
            b.innerHTML = '<i class="fa-solid fa-circle-info text-indigo-600 text-base"></i><span>Seu cronograma está vazio. Clique em um dia e use <strong>Adicionar neste dia</strong>, ou use o botão <strong>Novo item</strong>.</span>';
            return;
        }
        var datas = D.itens.map(function (i) { return i.data; }).sort();
        var feitos = D.itens.filter(function (i) { return i.concluido; }).length;
        b.innerHTML = '<i class="fa-solid fa-circle-check text-indigo-600 text-base"></i><span><strong>' + D.itens.length + ' itens</strong> de ' +
            br(parse(datas[0])) + ' a ' + br(parse(datas[datas.length - 1])) + ' · <strong>' + feitos + '</strong> concluído' + (feitos === 1 ? '' : 's') +
            '. Clique em um item para editar ou arraste-o para outro dia.</span>';
    }

    function legenda() {
        $('cronoLegend').innerHTML = D.disciplinas.map(function (d) {
            return '<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background-color:' + esc(d.cor) + '"></span>' + esc(d.nome) + '</span>';
        }).join('') + '<span class="inline-flex items-center gap-1.5">' + Object.keys(TIPO).map(function (k) {
            return '<span class="rounded px-1 text-[9px] font-bold ' + TIPO[k].badge + '">' + TIPO[k].letra + '</span> ' + TIPO[k].nome;
        }).join(' · ') + '</span>';
    }

    // ----- painel do dia -----
    function card(cor, titulo, linha1, linha2) {
        return '<div class="p-3 rounded-xl border ' + CARD[cor] + '"><div class="font-bold">' + esc(titulo) + '</div>' +
            '<div class="font-semibold text-gray-800 dark:text-gray-200 mt-1">' + esc(linha1) + '</div>' +
            (linha2 ? '<div class="text-gray-500 dark:text-gray-400 text-[11px]">' + esc(linha2) + '</div>' : '') + '</div>';
    }

    function botao(acao, id, icone, titulo, extra) {
        return '<button type="button" data-acao="' + acao + '" data-id="' + id + '" title="' + titulo + '" class="w-7 h-7 rounded-lg border text-[11px] ' + extra + '"><i class="fa-solid ' + icone + '"></i></button>';
    }

    function cardItem(it) {
        var t = TIPO[it.tipo];
        var hora = it.hora_inicio ? hhmm(it.hora_inicio) + (it.hora_fim ? '–' + hhmm(it.hora_fim) : '') + ' · ' : '';
        var titulo = hora + t.nome + ' · ' + it.minutos + ' min' + (it.questoes ? ' · ' + it.questoes + ' questões' : '');
        var botoes = '<div class="flex items-center gap-1 flex-none">' +
            botao('concluir', it.id, 'fa-check', it.concluido ? 'Desfazer conclusão' : 'Marcar como concluído',
                it.concluido ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-current hover:bg-white/60 dark:hover:bg-black/20') +
            botao('editar', it.id, 'fa-pen', 'Editar ou mover', 'border-current hover:bg-white/60 dark:hover:bg-black/20') +
            botao('excluir', it.id, 'fa-trash', 'Excluir', 'border-current hover:bg-white/60 dark:hover:bg-black/20') + '</div>';
        return '<div class="p-3 rounded-xl border ' + CARD[t.card] + (it.concluido ? ' opacity-75' : '') + '">' +
            '<div class="flex items-start justify-between gap-2"><div class="font-bold">' + esc(titulo) + '</div>' + botoes + '</div>' +
            '<div class="font-semibold text-gray-800 dark:text-gray-200 mt-1">' +
            (it.cor ? '<span class="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style="background-color:' + esc(it.cor) + '"></span>' : '') +
            esc(it.disciplina || t.nome) + '</div>' +
            (it.topico ? '<div class="text-gray-500 dark:text-gray-400 text-[11px]">' + esc(it.topico) + '</div>' : '') +
            (it.obs ? '<div class="text-[11px] mt-1 text-gray-600 dark:text-gray-300"><i class="fa-solid fa-lightbulb text-amber-500 mr-1"></i>' + esc(it.obs) + '</div>' : '') + '</div>';
    }

    function drawer() {
        var o = info(parse(sel)), cards = '', st = $('cronoDrawerStatus');
        function status(txt, cor) { st.textContent = txt; st.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full ' + cor; }
        var min = o.itens.reduce(function (s, i) { return s + i.minutos; }, 0);
        $('cronoDrawerTitle').textContent = 'Detalhes do Dia: ' + br(o.d) + ' (' + DIAS[wd(o.d)] + ')' +
            (o.itens.length ? ' · ' + o.itens.length + ' ite' + (o.itens.length === 1 ? 'm' : 'ns') + ' · ' + min + ' min' : '');
        $('btnExcluirDia').classList.toggle('hidden', !o.itens.length);

        var cinza = 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
        if (o.prova) {
            status('Dia da Prova', 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300');
        } else if (o.itens.length) {
            var todos = o.itens.every(function (i) { return i.concluido; });
            if (todos) status('Dia Concluído', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300');
            else if (o.passado) status('Itens pendentes', 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300');
            else if (o.hoje) status('Hoje', 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300');
            else status('Planejado', 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300');
        } else if (o.hoje) {
            status('Hoje', 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300');
        } else if (o.passado && o.reg.length) {
            status('Dia Concluído', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300');
        } else if (o.folga) {
            status('Folga', cinza);
        } else {
            status(o.passado ? 'Sem registro' : 'Sem plano', cinza);
        }

        if (o.prova) cards += card('amber', 'Dia da prova', D.prova ? br(parse(D.prova)) : '', 'Boa prova!');
        cards += o.itens.map(cardItem).join('');
        o.reg.forEach(function (r) { cards += cardLanc(r); });
        if (!cards) {
            cards = card('gray', o.folga ? 'Dia de folga' : 'Nada planejado para este dia', o.folga ? 'Descanso.' : 'Use "Adicionar neste dia" para planejar.', '');
        }
        $('cronoDrawerContent').innerHTML = cards;
    }

    // ----- modais -----
    function abrir(id) { $(id).classList.remove('hidden'); }
    function fechar(id) { $(id).classList.add('hidden'); }

    function itemPorId(id) {
        return D.itens.filter(function (i) { return String(i.id) === String(id); })[0];
    }

    function montarDisc(valor) {
        $('itemDisc').innerHTML = '<option value="">— Nenhuma —</option>' + D.disciplinas.map(function (d) {
            return '<option value="' + d.id + '"' + (String(d.id) === String(valor) ? ' selected' : '') + '>' + esc(d.nome) + '</option>';
        }).join('');
    }

    function montarTopicos(valor) {
        var d = D.disciplinas.filter(function (x) { return String(x.id) === $('itemDisc').value; })[0];
        $('itemTopico').innerHTML = '<option value="">— Nenhum —</option>' + (d ? d.topicos : []).map(function (t) {
            return '<option value="' + t.id + '"' + (String(t.id) === String(valor) ? ' selected' : '') + '>' + esc(t.nome) + '</option>';
        }).join('');
        $('itemTopico').disabled = !d;
    }

    function alternarCampos() {
        $('itemQuestWrap').classList.toggle('hidden', $('itemTipo').value === 'teoria');
    }

    function abrirItem(it, dataPadrao) {
        $('itemErro').classList.add('hidden');
        $('itemId').value = it ? it.id : '';
        $('itemModalTitulo').textContent = it ? 'Editar item' : 'Novo item';
        $('itemData').value = it ? it.data : dataPadrao;
        $('itemTipo').value = it ? it.tipo : 'teoria';
        montarDisc(it ? it.disciplina_id : '');
        montarTopicos(it ? it.topico_id : '');
        $('itemMin').value = it ? it.minutos : 45;
        $('itemQuest').value = it && it.questoes !== null ? it.questoes : '';
        $('itemObs').value = it ? it.obs : '';
        $('itemHIni').value = it ? it.hora_inicio : '';
        $('itemHFim').value = it ? it.hora_fim : '';
        $('btnExcluirItem').classList.toggle('hidden', !it);
        alternarCampos();
        abrir('modalItem');
    }

    function erroItem(msg) {
        $('itemErro').textContent = msg;
        $('itemErro').classList.remove('hidden');
    }

    function recarregar() {
        return fetch('/api/cronograma/', { headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) { D = d; indexar(); render(); });
    }

    $('itemDisc').addEventListener('change', function () { montarTopicos(''); });
    $('itemTipo').addEventListener('change', alternarCampos);

    $('formItem').addEventListener('submit', function (e) {
        e.preventDefault();
        var corpo = {
            id: $('itemId').value || null,
            data: $('itemData').value,
            tipo: $('itemTipo').value,
            disciplina_id: $('itemDisc').value || null,
            topico_id: $('itemTopico').value || null,
            minutos: $('itemMin').value,
            questoes: $('itemQuest').value,
            obs: $('itemObs').value,
            hora_inicio: $('itemHIni').value,
            hora_fim: $('itemHFim').value
        };
        window.apiPost('/api/cronograma/item/', corpo).then(function (r) {
            fechar('modalItem');
            sel = r.item.data;
            ref = parse(sel);
            return recarregar();
        }).catch(function (err) { erroItem(err.message); });
    });

    $('btnExcluirItem').addEventListener('click', function () {
        excluir($('itemId').value, true);
    });

    function excluir(id, doModal) {
        if (!window.confirm('Excluir este item do cronograma?')) return;
        window.apiPost('/api/cronograma/item/' + id + '/excluir/').then(function () {
            if (doModal) fechar('modalItem');
            return recarregar();
        }).catch(function (err) { window.alert(err.message); });
    }

    $('cronoDrawerContent').addEventListener('click', function (e) {
        var b = e.target.closest('[data-acao]');
        if (!b) return;
        var id = b.getAttribute('data-id'), it = itemPorId(id), acao = b.getAttribute('data-acao');
        if (!it) return;
        if (acao === 'editar') abrirItem(it, sel);
        else if (acao === 'excluir') excluir(id, false);
        else if (acao === 'concluir') {
            window.apiPost('/api/cronograma/item/' + id + '/concluir/', { concluido: !it.concluido })
                .then(recarregar)
                .catch(function (err) { window.alert(err.message); });
        }
    });

    $('btnNovoItem').addEventListener('click', function () { abrirItem(null, sel); });
    $('btnAddNoDia').addEventListener('click', function () { abrirItem(null, sel); });

    // ----- excluir dia e limpar período -----
    // Conta primeiro, pede confirmação e só então apaga. Resolve true se apagou.
    function limpar(ini, fim, concluidos, rotulo) {
        var base = { inicio: ini, fim: fim, incluir_concluidos: concluidos };
        return window.apiPost('/api/cronograma/limpar/', Object.assign({ confirmar: false }, base)).then(function (r) {
            if (!r.itens) { window.alert('Nenhum item para excluir ' + rotulo + '.'); return false; }
            var txt = 'Excluir ' + r.itens + (r.itens === 1 ? ' item ' : ' itens ') + rotulo + '?' +
                (concluidos ? '' : '\n(Os itens já concluídos serão mantidos.)') + '\n\nEsta ação não pode ser desfeita.';
            if (!window.confirm(txt)) return false;
            return window.apiPost('/api/cronograma/limpar/', Object.assign({ confirmar: true }, base))
                .then(function () { return recarregar(); })
                .then(function () { return true; });
        }).catch(function (err) { window.alert(err.message); return false; });
    }

    $('btnExcluirDia').addEventListener('click', function () {
        limpar(sel, sel, true, 'do dia ' + br(parse(sel)));
    });

    function erroLimpar(msg) { $('limErro').textContent = msg; $('limErro').classList.remove('hidden'); }

    $('btnLimpar').addEventListener('click', function () {
        var datas = D.itens.map(function (i) { return i.data; }).sort();
        $('limIni').value = D.hoje;
        $('limFim').value = datas.length && datas[datas.length - 1] > D.hoje ? datas[datas.length - 1] : D.hoje;
        $('limConcl').checked = false;
        $('limErro').classList.add('hidden');
        abrir('modalLimpar');
    });

    $('limTodo').addEventListener('click', function () {
        var datas = D.itens.map(function (i) { return i.data; }).sort();
        if (!datas.length) { erroLimpar('Não há itens no cronograma.'); return; }
        $('limIni').value = datas[0];
        $('limFim').value = datas[datas.length - 1];
        $('limErro').classList.add('hidden');
    });

    $('formLimpar').addEventListener('submit', function (e) {
        e.preventDefault();
        var ini = $('limIni').value, fim = $('limFim').value;
        if (!ini || !fim) { erroLimpar('Informe as duas datas.'); return; }
        if (fim < ini) { erroLimpar('A data final não pode ser anterior à inicial.'); return; }
        limpar(ini, fim, $('limConcl').checked, 'entre ' + br(parse(ini)) + ' e ' + br(parse(fim))).then(function (feito) {
            if (feito) fechar('modalLimpar');
        });
    });

    document.querySelectorAll('[data-fechar]').forEach(function (b) {
        b.addEventListener('click', function () { fechar(b.getAttribute('data-fechar')); });
    });
    ['modalItem', 'modalLimpar'].forEach(function (id) {
        $(id).addEventListener('click', function (e) { if (e.target === this) fechar(id); });
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { fechar('modalItem'); fechar('modalLimpar'); }
    });

    // ----- navegação, clique em item e arrastar -----
    function selecionar(e) {
        var chip = e.target.closest('[data-item]');
        if (chip) {
            var it = itemPorId(chip.getAttribute('data-item'));
            if (it) { sel = it.data; render(); abrirItem(it, sel); }
            return;
        }
        var n = e.target.closest('[data-iso]');
        if (!n) return;
        sel = n.getAttribute('data-iso');
        var d = parse(sel);
        if (visao === 'mes' && d.getMonth() !== ref.getMonth()) ref = d;
        render();
    }

    function aoArrastar(e) {
        var chip = e.target.closest('[data-item]');
        if (!chip) return;
        arrastando = chip.getAttribute('data-item');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', arrastando); } catch (x) { /* navegadores antigos */ }
    }
    function aoPassar(e) {
        if (arrastando && e.target.closest('[data-iso]')) e.preventDefault();
    }
    function aoSoltar(e) {
        var cel = e.target.closest('[data-iso]');
        if (!arrastando || !cel) return;
        e.preventDefault();
        var id = arrastando, novo = cel.getAttribute('data-iso'), it = itemPorId(id);
        arrastando = null;
        if (!it || it.data === novo) return;
        window.apiPost('/api/cronograma/item/' + id + '/mover/', { data: novo })
            .then(function () { sel = novo; return recarregar(); })
            .catch(function (err) { window.alert(err.message); });
    }

    function mover(s) {
        ref = visao === 'semana' ? somar(ref, 7 * s) : new Date(ref.getFullYear(), ref.getMonth() + s, 1);
        render();
    }
    $('cronoCalendarGrid').addEventListener('click', selecionar);
    $('cronoList').addEventListener('click', selecionar);
    $('cronoCalendarGrid').addEventListener('dragstart', aoArrastar);
    $('cronoCalendarGrid').addEventListener('dragover', aoPassar);
    $('cronoCalendarGrid').addEventListener('drop', aoSoltar);
    $('cronoCalendarGrid').addEventListener('dragend', function () { arrastando = null; });
    $('cronoPrev').addEventListener('click', function () { mover(-1); });
    $('cronoNext').addEventListener('click', function () { mover(1); });
    $('cronoBtnMonthView').addEventListener('click', function () { visao = 'mes'; render(); });
    $('cronoBtnWeekView').addEventListener('click', function () { visao = 'semana'; render(); });

    // minutos calculados a partir do horário (continuam editáveis)
    function calcularMinutos() {
        var a = $('itemHIni').value, b = $('itemHFim').value;
        if (!a || !b) return;
        var m = (parseInt(b.slice(0, 2), 10) * 60 + parseInt(b.slice(3, 5), 10)) -
                (parseInt(a.slice(0, 2), 10) * 60 + parseInt(a.slice(3, 5), 10));
        if (m > 0) $('itemMin').value = m;
    }
    $('itemHIni').addEventListener('change', calcularMinutos);
    $('itemHFim').addEventListener('change', calcularMinutos);

// ----- lançamentos de questões: card com lixeira -----
    function cardLanc(r) {
        var pct = Math.round(r.acertos / r.total * 100);
        return '<div class="p-3 rounded-xl border ' + CARD.gray + '">' +
            '<div class="flex items-start justify-between gap-2"><div class="font-bold">Lançado: ' + r.acertos + '/' + r.total + ' (' + pct + '%)</div>' +
            '<button type="button" data-acao="excluir-lanc" data-id="' + r.id + '" title="Apagar lançamento" class="w-7 h-7 rounded-lg border border-current text-[11px] hover:bg-white/60 dark:hover:bg-black/20 flex-none"><i class="fa-solid fa-trash"></i></button></div>' +
            '<div class="font-semibold text-gray-800 dark:text-gray-200 mt-1">' + esc(r.disciplina) + '</div>' +
            '<div class="text-gray-500 dark:text-gray-400 text-[11px]">' + esc(r.topico) + '</div></div>';
    }

    $('cronoDrawerContent').addEventListener('click', function (e) {
        var b = e.target.closest('[data-acao="excluir-lanc"]');
        if (!b) return;
        if (!window.confirm('Apagar este lançamento de questões? Os números do Dashboard vão mudar.')) return;
        window.apiPost('/api/lancamentos/' + b.getAttribute('data-id') + '/excluir/', {})
            .then(recarregar)
            .catch(function (err) { window.alert(err.message); });
    });

    indexar();
    render();
})();