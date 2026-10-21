(function () {
    'use strict';

    var D = JSON.parse(document.getElementById('dados-lancar').textContent);
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) {
        return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    };

    var selDisc = $('lancarDiscipline');
    var selTopico = $('lancarTopic');

    // Tópicos dependem da disciplina escolhida
    function carregarTopicos() {
        var d = D.filter(function (x) { return String(x.id) === selDisc.value; })[0];
        selTopico.innerHTML = (d ? d.topicos : []).map(function (t) {
            return '<option value="' + t.id + '">' + esc(t.nome) + '</option>';
        }).join('');
    }
    selDisc.addEventListener('change', carregarTopicos);
    carregarTopicos();

    function erro(msg) {
        $('lancarErrorText').textContent = msg;
        $('lancarErrorBox').classList.remove('hidden');
    }

    $('lancarForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var total = parseInt($('lancarTotal').value, 10);
        var acertos = parseInt($('lancarAcertos').value, 10);

        if (!total || total < 1) return erro('Informe o número de questões.');
        if (isNaN(acertos) || acertos < 0) return erro('Informe o número de acertos.');
        if (acertos > total) return erro('O número de acertos não pode ser maior do que o total de questões.');

        $('lancarErrorBox').classList.add('hidden');
        window.emBreve(6); // gravação no banco chega no Lote 6
    });
})();