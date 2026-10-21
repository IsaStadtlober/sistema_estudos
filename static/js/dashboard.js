/* Dashboard: gráficos com DADOS DE DEMONSTRAÇÃO.
   O Lote 4 troca o objeto DEMO por dados reais vindos do servidor. */
(function () {
    'use strict';

    var DISC = JSON.parse(document.getElementById('dados-disciplinas').textContent);
    var el = function (id) { return document.getElementById(id); };
    var dark = function () { return document.documentElement.classList.contains('dark'); };
    var esc = function (s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    };

    // ===== DADOS DE DEMONSTRAÇÃO =====
    var SEMANAS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
    var DEMO = {
        volume: [110, 125, 140, 115, 150, 165, 145, 180],
        acerto: [64, 68, 66, 72, 71, 75, 73, 78],
        planejado: [10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5],
        realizado: [9.5, 10.2, 11.0, 8.5, 10.5, 12.0, 10.0, 11.5],
        kpis: { questoes: 482, varQ: 8.4, acerto: 73.2, varA: 2.1, minutos: 2490, varM: 5.0, teoria: 38, topicosQ: 44 },
        cobertura: [38, 6, 56],
        fracos: [
            { topico: 'Licitações e Contratos (Lei 14.133)', disc: 'Direito Administrativo', pct: 52, ac: 13, tot: 25 },
            { topico: 'LDO, PPA e LOA', disc: 'Contabilidade Pública e AFO', pct: 56, ac: 14, tot: 25 },
            { topico: 'Regimento Interno do TCE-RJ', disc: 'Controle Externo e Legislação TCE-RJ', pct: 60, ac: 15, tot: 25 }
        ]
    };
    var ACC = DISC.map(function (d, i) {
        return Object.assign({}, d, { acc: 52 + ((i * 7) % 38), qs: 24 + ((i * 13) % 70), cov: (i * 11) % 100 });
    });

    var charts = {};
    function criar(id, config) {
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart(el(id), config);
    }

    function aplicarTemaChart() {
        Chart.defaults.color = dark() ? '#9ca3af' : '#6b7280';
        Chart.defaults.borderColor = dark() ? '#374151' : '#e5e7eb';
    }

    // Linha vertical da meta (70%) para gráfico de barras horizontais
    var linhaMeta = {
        id: 'linhaMeta',
        afterDatasetsDraw: function (chart) {
            var a = chart.chartArea, x = chart.scales.x, px = x.getPixelForValue(70), ctx = chart.ctx;
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

    function renderKpis() {
        var k = DEMO.kpis;
        var seta = function (v) { return '<i class="fa-solid fa-arrow-' + (v >= 0 ? 'up' : 'down') + '"></i> ' + (v >= 0 ? '+' : '') + v.toFixed(1) + '% vs ant.'; };
        el('kpiQuestoesVal').textContent = k.questoes;
        el('kpiQuestoesVar').innerHTML = seta(k.varQ);
        el('kpiAcertoVal').textContent = k.acerto.toFixed(1) + '%';
        el('kpiAcertoVar').innerHTML = seta(k.varA);
        el('kpiHorasVal').textContent = Math.floor(k.minutos / 60) + 'h' + String(k.minutos % 60).padStart(2, '0');
        el('kpiHorasVar').innerHTML = seta(k.varM);
        el('kpiTeoriaVal').textContent = k.teoria + '%';
        el('kpiTopicosQVal').textContent = k.topicosQ + '%';
    }

    function renderPrioridades() {
        var top = ACC.slice().sort(function (a, b) { return b.peso - a.peso; }).slice(0, 3);
        el('topPriorityDisciplinesList').innerHTML = top.map(function (d) {
            return '<div class="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:border-indigo-500 transition-all" data-sigla="' + esc(d.sigla) + '">' +
                '<div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background-color:' + esc(d.cor) + '"></span>' +
                '<span class="font-semibold text-gray-800 dark:text-gray-200 text-xs">' + esc(d.nome) + '</span></div>' +
                '<div class="flex items-center gap-2 text-[11px]"><span class="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold px-1.5 py-0.5 rounded">Peso ' + d.peso + '</span>' +
                '<span class="text-rose-500 font-bold">' + d.acc + '% acerto</span></div></div>';
        }).join('');
        el('topPriorityDisciplinesList').querySelectorAll('[data-sigla]').forEach(function (n) {
            n.addEventListener('click', function () { el('dashFilterDisc').value = n.dataset.sigla; });
        });

        el('weakestTopicsList').innerHTML = DEMO.fracos.map(function (w) {
            return '<div class="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between">' +
                '<div><div class="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[180px] text-xs">' + esc(w.topico) + '</div>' +
                '<div class="text-[10px] text-gray-400">' + esc(w.disc) + '</div></div>' +
                '<div class="text-rose-500 font-bold text-[11px]">' + w.pct + '% (' + w.ac + '/' + w.tot + ')</div></div>';
        }).join('');
    }

    function renderSemanal() {
        criar('chartWeeklyProgress', {
            type: 'bar',
            data: {
                labels: SEMANAS,
                datasets: [
                    { type: 'line', label: '% Acerto', data: DEMO.acerto, borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 3, yAxisID: 'y1', tension: 0.3 },
                    { type: 'bar', label: 'Questões', data: DEMO.volume, backgroundColor: '#6366f1', borderRadius: 6, yAxisID: 'y' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { position: 'left', grid: { display: false } },
                    y1: { position: 'right', min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } }
                }
            }
        });
    }

    function renderCobertura() {
        criar('chartEditalCoverage', {
            type: 'doughnut',
            data: {
                labels: ['Teoria Vista', 'Só Questões', 'Não Iniciado'],
                datasets: [{ data: DEMO.cobertura, backgroundColor: ['#6366f1', '#10b981', dark() ? '#374151' : '#e5e7eb'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    function renderAcertoDisciplina() {
        var ord = ACC.slice().sort(function (a, b) { return a.acc - b.acc; });
        criar('chartAccuracyBySubject', {
            type: 'bar',
            data: {
                labels: ord.map(function (d) { return d.nome; }),
                datasets: [{ label: '% Acerto', data: ord.map(function (d) { return d.acc; }), backgroundColor: ord.map(function (d) { return d.cor; }), borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } } },
                plugins: { legend: { display: false } },
                onClick: function (e, itens) { if (itens.length) abrirDetalhe(ord[itens[0].index]); }
            },
            plugins: [linhaMeta]
        });
    }

    function renderHoras() {
        criar('chartWeeklyHours', {
            type: 'bar',
            data: {
                labels: SEMANAS,
                datasets: [
                    { label: 'Planejado (h)', data: DEMO.planejado, backgroundColor: dark() ? '#475569' : '#cbd5e1', borderRadius: 4 },
                    { label: 'Realizado (h)', data: DEMO.realizado, backgroundColor: '#4f46e5', borderRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderHeatmap() {
        var cont = el('heatmapContainer');
        var niveis = [
            'bg-gray-100 dark:bg-gray-700',
            'bg-indigo-200 dark:bg-indigo-900',
            'bg-indigo-400 dark:bg-indigo-700',
            'bg-indigo-600 dark:bg-indigo-500'
        ];
        var html = '<div class="flex gap-1">';
        for (var c = 0; c < 13; c++) {
            html += '<div class="flex flex-col gap-1">';
            for (var r = 0; r < 7; r++) {
                var v = (c * 5 + r * 3 + (c % 3)) % 11;
                var nivel = v < 3 ? 0 : v < 6 ? 1 : v < 9 ? 2 : 3;
                html += '<div class="heatmap-cell ' + niveis[nivel] + '" title="Demonstração"></div>';
            }
            html += '</div>';
        }
        cont.innerHTML = html + '</div>';
    }

    var ativas = new Set(['BD', 'SI', 'DA', 'CLE'].filter(function (s) { return DISC.some(function (d) { return d.sigla === s; }); }));
    if (!ativas.size) DISC.slice(0, 4).forEach(function (d) { ativas.add(d.sigla); });

    function renderTrajetoria() {
        var box = el('trajectorySubjectToggles');
        box.innerHTML = '';
        DISC.forEach(function (d) {
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

        var datasets = ACC.filter(function (d) { return ativas.has(d.sigla); }).map(function (d, i) {
            var base = 55 + ((i * 3) % 10);
            return {
                label: d.nome, borderColor: d.cor, backgroundColor: d.cor, tension: 0.3,
                data: [0, 1, 2, 3, 4].map(function (s) { return base + s * 4 + ((s * (i + 2)) % 3); })
            };
        });
        criar('chartAccuracyTrajectory', {
            type: 'line',
            data: { labels: ['Semana 1', 'Semana 3', 'Semana 5', 'Semana 7', 'Atual'], datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } } } }
        });
    }

    function renderTabela() {
        el('dashDisciplineTableBody').innerHTML = ACC.map(function (d) {
            var ac = Math.round(d.qs * d.acc / 100), er = d.qs - ac;
            return '<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">' +
                '<td class="p-3 font-semibold"><span class="inline-block w-3 h-3 rounded-full mr-2 align-middle" style="background-color:' + esc(d.cor) + '"></span>' + esc(d.nome) + '</td>' +
                '<td class="p-3 text-center font-bold">' + d.peso + '</td>' +
                '<td class="p-3 text-center">' + d.qs + ' <span class="text-emerald-500">(' + ac + ')</span> / <span class="text-rose-500">(' + er + ')</span></td>' +
                '<td class="p-3 text-center font-bold ' + (d.acc >= 70 ? 'text-emerald-500' : 'text-rose-500') + '">' + d.acc + '%</td>' +
                '<td class="p-3"><div class="flex items-center gap-2"><div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-indigo-600 rounded-full" style="width:' + d.cov + '%"></div></div>' +
                '<span class="text-[10px] font-bold text-gray-500">' + d.cov + '%</span></div></td>' +
                '<td class="p-3 text-center"><button type="button" data-sigla="' + esc(d.sigla) + '" class="btn-detalhe text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-bold">Ver Lançamentos</button></td></tr>';
        }).join('');
        el('dashDisciplineTableBody').querySelectorAll('.btn-detalhe').forEach(function (b) {
            b.addEventListener('click', function () {
                abrirDetalhe(ACC.find(function (d) { return d.sigla === b.dataset.sigla; }));
            });
        });
    }

    // Modal de detalhamento (lançamentos reais no Lote 4)
    function abrirDetalhe(d) {
        el('drillDownModalTitle').textContent = 'Lançamentos: ' + (d ? d.nome : '');
        el('drillDownModalTableBody').innerHTML =
            '<tr><td colspan="5" class="p-4 text-center text-gray-400">Os lançamentos reais desta disciplina aparecem a partir do Lote 4.</td></tr>';
        el('drillDownModal').classList.remove('hidden');
    }
    function fecharDetalhe() { el('drillDownModal').classList.add('hidden'); }
    el('closeDrillDownModal').addEventListener('click', fecharDetalhe);
    el('drillDownModal').addEventListener('click', function (e) { if (e.target === this) fecharDetalhe(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharDetalhe(); });

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

    window.addEventListener('themechange', renderTudo);
    renderTudo();
})();