/* Dashboard: busca os dados em /api/dashboard/ e desenha cards, gráficos e tabela. */
(function () {
    'use strict';

    var URL_API = '/api/dashboard/';
    var $ = function (id) { return document.getElementById(id); };
    var fConc = $('dashFilterConcurso');
    var fDisc = $('dashFilterDisc');
    var fPer = $('dashFilterPeriod');

    var D = null;          // última resposta da API
    var charts = {};
    var ativas = null;     // siglas exibidas na trajetória
    var pedido = 0;        // evita resposta antiga sobrescrever a nova

    // ---------- utilidades ----------
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function num(v, casas) { return Number(v).toFixed(casas || 0).replace('.', ','); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function dark() { return document.documentElement.classList.contains('dark'); }

    function aplicarTemaChart() {
        Chart.defaults.color = dark() ? '#9ca3af' : '#6b7280';
        Chart.defaults.borderColor = dark() ? '#374151' : '#e5e7eb';
    }

    function criar(id, config) {
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart($(id), config);
    }

    // Mostra mensagem no lugar do gráfico quando não há dados
    function estadoVazio(id, vazio, msg) {
        var canvas = $(id), box = canvas.parentNode, ov = box.querySelector('.estado-vazio');
        if (vazio) {
            if (!ov) {
                ov = document.createElement('div');
                ov.className = 'estado-vazio absolute inset-0 flex items-center justify-center text-center text-xs text-gray-400 px-6';
                box.appendChild(ov);
            }
            ov.textContent = msg;
            canvas.style.visibility = 'hidden';
            if (charts[id]) { charts[id].destroy(); delete charts[id]; }
        } else {
            if (ov) ov.remove();
            canvas.style.visibility = 'visible';
        }
        return vazio;
    }

    // ---------- carregamento ----------
    function montarDisciplinas(lista) {
        var atual = fDisc.value;
        fDisc.innerHTML = '<option value="ALL">Todas as Disciplinas</option>' + lista.map(function (d) {
            return '<option value="' + esc(d.sigla) + '">' + esc(d.nome) + '</option>';
        }).join('');
        fDisc.value = lista.some(function (d) { return d.sigla === atual; }) ? atual : 'ALL';
    }

    function carregar() {
        var n = ++pedido;
        $('dashRoot').classList.add('opacity-60');
        var qs = new URLSearchParams({ concurso: fConc.value, disciplina: fDisc.value, periodo: fPer.value });
        fetch(URL_API + '?' + qs.toString(), { headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (n !== pedido) return;
                D = d;
                $('dashErro').classList.add('hidden');
                montarDisciplinas(d.filtros.disciplinas);
                renderTudo();
            })
            .catch(function () { if (n === pedido) $('dashErro').classList.remove('hidden'); })
            .then(function () { if (n === pedido) $('dashRoot').classList.remove('opacity-60'); });
    }

    // ---------- cards ----------
    function variacao(id, v, sufixo) {
        var n = $(id);
        if (v === null || v === undefined) {
            n.className = 'text-[11px] mt-1 font-medium text-gray-400';
            n.textContent = 'sem comparação';
            return;
        }
        var sobe = v >= 0;
        n.className = 'text-[11px] mt-1 font-medium ' + (sobe ? 'text-emerald-500' : 'text-rose-500');
        n.innerHTML = '<i class="fa-solid fa-arrow-' + (sobe ? 'up' : 'down') + '"></i> ' + (sobe ? '+' : '') + num(v, 1) + sufixo + ' vs ant.';
    }

    function renderKpis() {
        var k = D.kpis;
        $('kpiQuestoesVal').textContent = k.questoes;
        variacao('kpiQuestoesVar', k.var_questoes, '%');
        $('kpiAcertoVal').textContent = k.pct === null ? '—' : num(k.pct, 1) + '%';
        variacao('kpiAcertoVar', k.var_pct, ' p.p.');
        $('kpiAcertoDet').textContent = k.acertos + ' certas · ' + k.erros + ' erradas';
        $('kpiHorasVal').textContent = Math.floor(k.minutos / 60) + 'h' + pad(k.minutos % 60);
        variacao('kpiHorasVar', k.var_minutos, '%');
        $('kpiTeoriaVal').textContent = k.teoria + '%';
        $('kpiTopicosQVal').textContent = k.topicos_q + '%';
        $('dashTabelaTitulo').textContent = D.filtros.concurso_nome;
    }

    // ---------- Onde focar ----------
    function renderPrioridades() {
        var box = $('topPriorityDisciplinesList');
        box.innerHTML = D.prioridades.length ? D.prioridades.map(function (d) {
            var ac = d.acerto === null
                ? '<span class="text-gray-400 font-bold">sem questões</span>'
                : '<span class="' + (d.acerto >= D.meta_acerto ? 'text-emerald-500' : 'text-rose-500') + ' font-bold">' + d.acerto + '% acerto</span>';
            return '<div class="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:border-indigo-500 transition-all" data-sigla="' + esc(d.sigla) + '">' +
                '<div class="flex items-center gap-2 min-w-0"><span class="w-2.5 h-2.5 rounded-full flex-none" style="background-color:' + esc(d.cor) + '"></span>' +
                '<span class="font-semibold text-gray-800 dark:text-gray-200 text-xs truncate">' + esc(d.nome) + '</span></div>' +
                '<div class="flex items-center gap-2 text-[11px] flex-none"><span class="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold px-1.5 py-0.5 rounded">Peso ' + d.peso + '</span>' + ac + '</div></div>';
        }).join('') : '<p class="text-xs text-gray-400">Sem disciplinas neste filtro.</p>';

        box.querySelectorAll('[data-sigla]').forEach(function (n) {
            n.addEventListener('click', function () { fDisc.value = n.getAttribute('data-sigla'); carregar(); });
        });

        $('weakestTopicsList').innerHTML = D.fracos.length ? D.fracos.map(function (w) {
            return '<div class="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">' +
                '<div class="min-w-0"><div class="font-semibold text-gray-800 dark:text-gray-200 truncate text-xs">' + esc(w.topico) + '</div>' +
                '<div class="text-[10px] text-gray-400 truncate">' + esc(w.disciplina) + '</div></div>' +
                '<div class="text-rose-500 font-bold text-[11px] flex-none">' + num(w.pct, 0) + '% (' + w.acertos + '/' + w.total + ')</div></div>';
        }).join('') : '<p class="text-xs text-gray-400">Nenhum tópico com 5 ou mais questões ainda.</p>';
    }

    // ---------- gráficos ----------
    function renderSemanal() {
        var s = D.semanal;
        var vazio = s.questoes.every(function (q) { return q === 0; });
        if (estadoVazio('chartWeeklyProgress', vazio, 'Lance suas primeiras questões para ver a evolução.')) return;
        criar('chartWeeklyProgress', {
            type: 'bar',
            data: {
                labels: s.labels,
                datasets: [
                    { type: 'line', label: '% Acerto', data: s.acerto, borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 3, yAxisID: 'y1', tension: 0.3, spanGaps: true },
                    { type: 'bar', label: 'Questões', data: s.questoes, backgroundColor: '#6366f1', borderRadius: 6, yAxisID: 'y' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { position: 'left', beginAtZero: true, grid: { display: false } },
                    y1: { position: 'right', min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } }
                }
            }
        });
    }

    function renderCobertura() {
        var c = D.cobertura;
        if (estadoVazio('chartEditalCoverage', c.total === 0, 'Este filtro não tem tópicos no edital.')) return;
        criar('chartEditalCoverage', {
            type: 'doughnut',
            data: {
                labels: ['Teoria Vista', 'Só Questões', 'Não Iniciado'],
                datasets: [{ data: [c.teoria, c.so_questoes, c.nao_iniciado], backgroundColor: ['#6366f1', '#10b981', dark() ? '#374151' : '#e5e7eb'], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: function (c2) { return ' ' + c2.label + ': ' + c2.parsed + ' tópico' + (c2.parsed === 1 ? '' : 's'); } } }
                }
            }
        });
    }

    // Linha vertical da meta (ex.: 70%) no gráfico de barras horizontais
    var linhaMeta = {
        id: 'linhaMeta',
        afterDatasetsDraw: function (chart) {
            var a = chart.chartArea, px = chart.scales.x.getPixelForValue(D.meta_acerto), ctx = chart.ctx;
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(px, a.top);
            ctx.lineTo(px, a.bottom);
            ctx.stroke();
            ctx.restore();
        }
    };

    function renderAcertoDisciplina() {
        var ord = D.grafico_acerto;
        if (estadoVazio('chartAccuracyBySubject', ord.length === 0, 'Sem questões lançadas neste filtro e período.')) return;
        criar('chartAccuracyBySubject', {
            type: 'bar',
            data: {
                labels: ord.map(function (d) { return d.nome; }),
                datasets: [{ label: '% Acerto', data: ord.map(function (d) { return d.pct; }), backgroundColor: ord.map(function (d) { return d.cor; }), borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' ' + num(c.parsed.x, 1) + '% de acerto'; } } } },
                onClick: function (e, itens) { if (itens.length) abrirDetalhe(ord[itens[0].index].id, ord[itens[0].index].nome); },
                onHover: function (e, itens) { e.native.target.style.cursor = itens.length ? 'pointer' : 'default'; }
            },
            plugins: [linhaMeta]
        });
    }

    function renderHoras() {
        var s = D.semanal;
        var vazio = s.horas.every(function (h) { return h === 0; });
        if (estadoVazio('chartWeeklyHours', vazio, 'Sem minutos registrados nas últimas 8 semanas.')) return;
        criar('chartWeeklyHours', {
            type: 'bar',
            data: {
                labels: s.labels,
                datasets: [
                    { label: 'Planejado (h)', data: s.labels.map(function () { return s.planejado; }), backgroundColor: dark() ? '#475569' : '#cbd5e1', borderRadius: 4 },
                    { label: 'Realizado (h)', data: s.horas, backgroundColor: '#4f46e5', borderRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    function renderHeatmap() {
        var c = D.calor, box = $('heatmapContainer');
        var algum = c.dias.some(function (m) { return m > 0; });
        if (!algum) {
            box.innerHTML = '<p class="text-xs text-gray-400 py-4">Sem estudo registrado nos últimos 90 dias.</p>';
            return;
        }
        var niveis = [
            'bg-gray-100 dark:bg-gray-700',
            'bg-indigo-200 dark:bg-indigo-900',
            'bg-indigo-400 dark:bg-indigo-700',
            'bg-indigo-600 dark:bg-indigo-500'
        ];
        var ini = new Date(c.inicio + 'T12:00:00');
        var html = '<div class="flex gap-1">';
        for (var col = 0; col < 13; col++) {
            html += '<div class="flex flex-col gap-1">';
            for (var row = 0; row < 7; row++) {
                var i = col * 7 + row, m = c.dias[i];
                if (m === null) { html += '<div class="heatmap-cell"></div>'; continue; }
                var d = new Date(ini.getTime());
                d.setDate(d.getDate() + i);
                var nivel = m <= 0 ? 0 : m < c.meta * 0.4 ? 1 : m < c.meta * 0.8 ? 2 : 3;
                html += '<div class="heatmap-cell ' + niveis[nivel] + '" title="' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ': ' + m + ' min"></div>';
            }
            html += '</div>';
        }
        box.innerHTML = html + '</div>';
    }

    function garantirAtivas() {
        var siglas = D.trajetoria.map(function (d) { return d.sigla; });
        if (ativas) ativas = new Set(Array.from(ativas).filter(function (s) { return siglas.indexOf(s) !== -1; }));
        if (!ativas || !ativas.size) {
            var pref = ['BD', 'SI', 'DA', 'CLE'].filter(function (s) { return siglas.indexOf(s) !== -1; });
            ativas = new Set(pref.length ? pref : siglas.slice(0, 4));
        }
    }

    function renderTrajetoria() {
        garantirAtivas();
        var box = $('trajectorySubjectToggles');
        box.innerHTML = '';
        D.trajetoria.forEach(function (d) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'text-[10px] px-2 py-1 rounded-lg font-semibold transition-all ' +
                (ativas.has(d.sigla) ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300');
            b.textContent = d.sigla;
            b.title = d.nome;
            b.addEventListener('click', function () {
                if (ativas.has(d.sigla)) ativas.delete(d.sigla); else ativas.add(d.sigla);
                renderTrajetoria();
            });
            box.appendChild(b);
        });

        var series = D.trajetoria.filter(function (d) { return ativas.has(d.sigla); });
        var vazio = series.every(function (d) { return d.serie.every(function (v) { return v === null; }); });
        if (estadoVazio('chartAccuracyTrajectory', vazio, 'Sem dados de acerto para as disciplinas selecionadas.')) return;
        criar('chartAccuracyTrajectory', {
            type: 'line',
            data: {
                labels: D.semanal.labels,
                datasets: series.map(function (d) {
                    return { label: d.nome, data: d.serie, borderColor: d.cor, backgroundColor: d.cor, tension: 0.3, spanGaps: true };
                })
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } } } }
        });
    }

    // ---------- tabela e detalhamento ----------
    function renderTabela() {
        var corpo = $('dashDisciplineTableBody');
        if (!D.tabela.length) {
            corpo.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400">Nenhuma disciplina neste filtro.</td></tr>';
            return;
        }
        corpo.innerHTML = D.tabela.map(function (d) {
            var acerto = d.pct === null
                ? '<span class="text-gray-400">—</span>'
                : '<span class="font-bold ' + (d.pct >= D.meta_acerto ? 'text-emerald-500' : 'text-rose-500') + '">' + num(d.pct, 0) + '%</span>';
            return '<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">' +
                '<td class="p-3 font-semibold"><span class="inline-block w-3 h-3 rounded-full mr-2 align-middle" style="background-color:' + esc(d.cor) + '"></span>' + esc(d.nome) + '</td>' +
                '<td class="p-3 text-center font-bold">' + d.peso + '</td>' +
                '<td class="p-3 text-center">' + d.questoes + ' <span class="text-emerald-500">(' + d.acertos + ')</span> / <span class="text-rose-500">(' + d.erros + ')</span></td>' +
                '<td class="p-3 text-center">' + acerto + '</td>' +
                '<td class="p-3"><div class="flex items-center gap-2"><div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-indigo-600 rounded-full" style="width:' + d.cobertura + '%"></div></div>' +
                '<span class="text-[10px] font-bold text-gray-500">' + d.cobertura + '%</span></div></td>' +
                '<td class="p-3 text-center"><button type="button" data-id="' + d.id + '" data-nome="' + esc(d.nome) + '" class="btn-detalhe text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-bold">Ver Lançamentos</button></td></tr>';
        }).join('');
        corpo.querySelectorAll('.btn-detalhe').forEach(function (b) {
            b.addEventListener('click', function () { abrirDetalhe(b.getAttribute('data-id'), b.getAttribute('data-nome')); });
        });
    }

    function abrirDetalhe(id, nome) {
        var corpo = $('drillDownModalTableBody');
        $('drillDownModalTitle').textContent = 'Lançamentos: ' + nome;
        corpo.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Carregando...</td></tr>';
        $('drillDownModal').classList.remove('hidden');

        var qs = new URLSearchParams({ disciplina: id, periodo: fPer.value });
        fetch(URL_API + 'lancamentos/?' + qs.toString(), { headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d.itens.length) {
                    corpo.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Nenhum lançamento neste período.</td></tr>';
                    return;
                }
                corpo.innerHTML = d.itens.map(function (l) {
                    return '<tr><td class="p-2.5">' + l.data + '</td><td class="p-2.5 font-medium">' + esc(l.topico) + '</td>' +
                        '<td class="p-2.5 text-center">' + l.total + '</td>' +
                        '<td class="p-2.5 text-center text-emerald-500 font-bold">' + l.acertos + '</td>' +
                        '<td class="p-2.5 text-center font-bold ' + (l.pct >= D.meta_acerto ? 'text-emerald-500' : 'text-rose-500') + '">' + l.pct + '%</td></tr>';
                }).join('');
                if (d.total > d.itens.length) {
                    corpo.innerHTML += '<tr><td colspan="5" class="p-3 text-center text-gray-400">Mostrando ' + d.itens.length + ' de ' + d.total + ' lançamentos.</td></tr>';
                }
            })
            .catch(function () {
                corpo.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-rose-500">Não foi possível carregar os lançamentos.</td></tr>';
            });
    }

    function fecharDetalhe() { $('drillDownModal').classList.add('hidden'); }
    $('closeDrillDownModal').addEventListener('click', fecharDetalhe);
    $('drillDownModal').addEventListener('click', function (e) { if (e.target === this) fecharDetalhe(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharDetalhe(); });

    // ---------- orquestração ----------
    function renderTudo() {
        aplicarTemaChart();
        renderKpis();
        renderPrioridades();
        renderSemanal();
        renderCobertura();
        renderAcertoDisciplina();
        renderHoras();
        renderHeatmap();
        renderTrajetoria();
        renderTabela();
    }

    fConc.addEventListener('change', function () { fDisc.value = 'ALL'; carregar(); });
    fDisc.addEventListener('change', carregar);
    fPer.addEventListener('change', carregar);
    window.addEventListener('themechange', function () { if (D) renderTudo(); });

    carregar();
})();