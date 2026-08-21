(function () {
  'use strict';

  const configured = window.MP_TRAINING_CONFIG || {};
  const pathId = location.pathname.split('/').filter(Boolean)[0] || 'aluno';
  const pageTitle = (document.querySelector('h1')?.textContent || 'Protocolo').trim();
  const config = {
    studentId: configured.studentId || pathId,
    studentName: configured.studentName || pageTitle.replace(/^Protocolo\s+/i, '').trim(),
    protocolName: configured.protocolName || pageTitle,
    cycleId: configured.cycleId || 'ciclo-2026-08',
    whatsapp: configured.whatsapp || '5533999291921'
  };

  const storageKey = `mp_training_v1:${config.studentId}:${config.cycleId}`;
  let state = loadState();
  let restoring = false;
  let restoreTimer = null;
  let finishWrapped = false;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && saved.version === 1) return saved;
    } catch (_) {}
    return {
      version: 1,
      studentId: config.studentId,
      studentName: config.studentName,
      protocolName: config.protocolName,
      cycleId: config.cycleId,
      records: {},
      sessions: {},
      updatedAt: null
    };
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      showSaved();
    } catch (_) {
      showToast('Não foi possível salvar neste navegador.', true);
    }
  }

  function slug(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  function activeButton(selector) {
    return document.querySelector(`${selector} button.on, ${selector} button.active, ${selector} button[aria-selected="true"]`);
  }

  function currentWeek() {
    const button = activeButton('.weeks') || document.querySelector('.weeks button');
    const value = button?.dataset.week || button?.textContent?.match(/\d+/)?.[0];
    if (value) return Number(value);
    if (typeof window.currentWeek === 'number') return window.currentWeek;
    if (typeof window.week === 'number') return window.week;
    return 1;
  }

  function currentDay() {
    const buttons = [...document.querySelectorAll('.days button')];
    const button = activeButton('.days') || buttons[0];
    const index = Math.max(0, buttons.indexOf(button));
    const id = button?.dataset.day || (typeof window.currentDay === 'string' ? window.currentDay : '') || String(index);
    const label = (button?.textContent || id || `Dia ${index + 1}`).trim();
    return { id: slug(id), label, index, total: buttons.length || 1 };
  }

  function exerciseName(card, index) {
    return (card.querySelector('.name, .exercise-name, h3, h4')?.textContent || `Exercício ${index + 1}`).trim();
  }

  function setNumber(set, index) {
    const text = [...set.querySelectorAll('span, b')].map(el => el.textContent).join(' ');
    return Number(text.match(/s[eé]rie\s*(\d+)/i)?.[1] || index + 1);
  }

  function fieldName(input, index) {
    const hint = `${input.name || ''} ${input.placeholder || ''}`.toLowerCase();
    if (/kg|carga|peso/.test(hint)) return 'load';
    if (/rep/.test(hint)) return 'reps';
    if (/rir/.test(hint)) return 'rir';
    if (/pace/.test(hint)) return 'pace';
    if (/tempo|time/.test(hint)) return 'time';
    if (/rpe|int\.?|intens/.test(hint)) return 'intensity';
    return `field${index + 1}`;
  }

  function setContext(set) {
    const card = set.closest('.card, .exercise-card, section');
    if (!card) return null;
    const cards = [...document.querySelectorAll('#workoutContent .card, #main .card, .exercise-card')];
    const cardIndex = Math.max(0, cards.indexOf(card));
    const sets = [...card.querySelectorAll('.set')];
    const setIndex = Math.max(0, sets.indexOf(set));
    const day = currentDay();
    const week = currentWeek();
    const exercise = exerciseName(card, cardIndex);
    const series = setNumber(set, setIndex);
    return {
      id: `${week}|${day.id}|${slug(exercise)}|${series}`,
      week,
      dayId: day.id,
      dayLabel: day.label,
      dayIndex: day.index,
      exercise,
      exerciseIndex: cardIndex,
      series
    };
  }

  function ensureRecord(context) {
    if (!state.records[context.id]) {
      state.records[context.id] = {
        week: context.week,
        dayId: context.dayId,
        dayLabel: context.dayLabel,
        dayIndex: context.dayIndex,
        exercise: context.exercise,
        exerciseIndex: context.exerciseIndex,
        series: context.series,
        fields: {},
        done: false,
        updatedAt: null
      };
    }
    return state.records[context.id];
  }

  function readStaticRir(set) {
    const values = [...set.querySelectorAll('span')].map(el => el.textContent.trim());
    const text = values.find(value => /^RIR\s*/i.test(value));
    return text ? text.replace(/^RIR\s*/i, '').trim() : '';
  }

  function saveSet(set, persist) {
    const context = setContext(set);
    if (!context) return;
    const record = ensureRecord(context);
    [...set.querySelectorAll('input')].forEach((input, index) => {
      record.fields[fieldName(input, index)] = input.value.trim();
    });
    if (!record.fields.rir) record.fields.rir = readStaticRir(set);
    const check = set.querySelector('.check');
    if (check) record.done = check.classList.contains('done') || check.textContent.trim() === '✓';
    record.updatedAt = new Date().toISOString();
    if (persist) saveState();
  }

  function restoreInputs() {
    if (restoring) return;
    restoring = true;
    let migrated = false;
    document.querySelectorAll('.set').forEach(set => {
      const context = setContext(set);
      if (!context) return;
      let record = state.records[context.id];
      const inputs = [...set.querySelectorAll('input')];
      const check = set.querySelector('.check');

      if (!record) {
        const hasLegacy = inputs.some(input => input.value) || check?.classList.contains('done');
        if (hasLegacy) {
          record = ensureRecord(context);
          inputs.forEach((input, index) => {
            record.fields[fieldName(input, index)] = input.value.trim();
          });
          record.fields.rir ||= readStaticRir(set);
          record.done = Boolean(check?.classList.contains('done'));
          record.updatedAt = new Date().toISOString();
          migrated = true;
        }
      }

      if (!record) return;
      inputs.forEach((input, index) => {
        const saved = record.fields[fieldName(input, index)];
        if (saved !== undefined && saved !== '') input.value = saved;
      });
      if (check && record.done) {
        if (!check.classList.contains('done')) check.classList.add('done');
        if (check.textContent.trim() !== '✓') check.textContent = '✓';
      }
    });
    restoring = false;
    if (migrated) saveState();
    try {
      if (typeof window.updateProgress === 'function') window.updateProgress();
      else if (typeof window.progress === 'function') window.progress();
    } catch (_) {}
  }

  function scheduleRestore() {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreInputs, 40);
  }

  function collectCurrentWorkout() {
    document.querySelectorAll('.set').forEach(set => saveSet(set, false));
    saveState();
  }

  function sessionId(week, dayId) {
    return `${week}|${dayId}`;
  }

  function workoutDuration() {
    return (document.getElementById('totalClock')?.textContent || document.getElementById('clock')?.textContent || '').trim();
  }

  function finishSession(mood, feedback) {
    collectCurrentWorkout();
    const week = currentWeek();
    const day = currentDay();
    state.sessions[sessionId(week, day.id)] = {
      week,
      dayId: day.id,
      dayLabel: day.label,
      date: new Date().toISOString(),
      duration: workoutDuration(),
      mood: mood || 'Não informado',
      feedback: feedback || 'Sem observações',
      completed: true
    };
    saveState();
    return { week, day };
  }

  function csvCell(value) {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    return `"${text.replace(/"/g, '""')}"`;
  }

  function rowsFor(scope, week, dayId) {
    return Object.values(state.records)
      .filter(record => scope === 'full' || (record.week === week && record.dayId === dayId))
      .sort((a, b) => a.week - b.week || a.dayIndex - b.dayIndex || a.exerciseIndex - b.exerciseIndex || a.series - b.series);
  }

  function buildCsv(scope, week, dayId) {
    const headers = [
      'aluno', 'protocolo', 'ciclo', 'semana', 'dia', 'data', 'exercicio', 'serie',
      'carga', 'repeticoes', 'RIR', 'tempo', 'pace', 'intensidade', 'concluida',
      'duracao_treino', 'percepcao', 'feedback', 'atualizado_em'
    ];
    const lines = [headers.map(csvCell).join(';')];
    rowsFor(scope, week, dayId).forEach(record => {
      const session = state.sessions[sessionId(record.week, record.dayId)] || {};
      lines.push([
        config.studentName,
        config.protocolName,
        config.cycleId,
        record.week,
        record.dayLabel,
        session.date || '',
        record.exercise,
        record.series,
        record.fields.load || '',
        record.fields.reps || '',
        record.fields.rir || '',
        record.fields.time || '',
        record.fields.pace || '',
        record.fields.intensity || '',
        record.done ? 'sim' : 'não',
        session.duration || '',
        session.mood || '',
        session.feedback || '',
        record.updatedAt || ''
      ].map(csvCell).join(';'));
    });
    return '\ufeff' + lines.join('\r\n');
  }

  function dateStamp() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  }

  function makeFile(name, content) {
    return new File([content], name, { type: 'text/csv;charset=utf-8' });
  }

  function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function isFinalWorkout(context) {
    return context.week === 4 && context.day.index === context.day.total - 1;
  }

  function summaryMessage(context, mood, feedback, checkout) {
    const records = rowsFor('daily', context.week, context.day.id);
    const completed = records.filter(record => record.done).length;
    const loads = records
      .filter(record => record.fields.load)
      .map(record => `${record.exercise} S${record.series}: ${record.fields.load} kg${record.fields.reps ? ` × ${record.fields.reps}` : ''}`);
    const loadText = loads.length ? loads.slice(0, 18).join('\n') : 'Nenhuma carga informada.';
    return [
      `Treino concluído — ${config.protocolName}`,
      '',
      `Aluno: ${config.studentName}`,
      `Semana: ${context.week}/4`,
      `Dia: ${context.day.label}`,
      `Séries concluídas: ${completed}/${records.length}`,
      `Percepção: ${mood || 'Não informado'}`,
      `Feedback: ${feedback || 'Sem observações'}`,
      '',
      'Cargas registradas:',
      loadText,
      '',
      checkout ? 'Check-out completo das 4 semanas anexado.' : 'Mini arquivo do treino anexado.'
    ].join('\n');
  }

  async function exportWorkout(mood, feedback) {
    const context = finishSession(mood, feedback);
    const checkout = isFinalWorkout(context);
    const base = slug(config.studentName).replace(/-/g, '_');
    const dailyName = `${base}_semana-${context.week}_${context.day.id}_${dateStamp()}.csv`;
    const files = [makeFile(dailyName, buildCsv('daily', context.week, context.day.id))];
    if (checkout) {
      files.push(makeFile(`checkout_${base}_${config.cycleId}.csv`, buildCsv('full', context.week, context.day.id)));
    }
    const message = summaryMessage(context, mood, feedback, checkout);

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
        await navigator.share({
          title: checkout ? `Check-out ${config.studentName}` : `Treino ${config.studentName}`,
          text: message,
          files
        });
        showToast(checkout ? 'Check-out preparado para envio.' : 'Arquivo do treino preparado para envio.');
        closeExportModal();
        closeLegacyFeedback();
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }

    files.forEach(downloadFile);
    const whatsapp = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(message + '\n\nO arquivo foi baixado. Anexe-o nesta conversa.')}`;
    window.open(whatsapp, '_blank');
    showToast('Arquivo baixado. Anexe-o na conversa do WhatsApp.');
    closeExportModal();
    closeLegacyFeedback();
  }

  function addStyles() {
    if (document.getElementById('mp-storage-style')) return;
    const style = document.createElement('style');
    style.id = 'mp-storage-style';
    style.textContent = `
      #mpSavedStatus{position:fixed;right:12px;bottom:12px;z-index:9997;background:#192F5A;color:#fff;border-radius:999px;padding:8px 11px;font:800 10px Arial;opacity:0;transform:translateY(8px);transition:.2s;pointer-events:none;box-shadow:0 6px 18px #0003}
      #mpSavedStatus.on{opacity:1;transform:translateY(0)}
      #mpToast{position:fixed;left:50%;top:16px;transform:translate(-50%,-10px);z-index:10002;background:#192F5A;color:#fff;border-radius:12px;padding:11px 14px;font:800 12px Arial;opacity:0;transition:.2s;box-shadow:0 8px 24px #0004;text-align:center;max-width:calc(100% - 28px)}
      #mpToast.on{opacity:1;transform:translate(-50%,0)} #mpToast.error{background:#9f2d2d}
      #mpExportModal{position:fixed;inset:0;z-index:10000;background:#000b;display:none;align-items:flex-end;justify-content:center;padding:12px}
      #mpExportModal.on{display:flex}.mpExportSheet{width:min(620px,100%);background:#fff;color:#172033;border-radius:22px;padding:18px;box-shadow:0 20px 60px #0006;font-family:Arial,sans-serif}
      .mpExportSheet h3{margin:0;color:#192F5A;font-size:20px}.mpExportSheet p{font-size:12px;color:#667085;line-height:1.45}.mpMoods{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:12px 0}.mpMoods button{border:1px solid #d8dde6;background:#f5f6f8;color:#344054;border-radius:11px;padding:8px 2px;font-size:18px}.mpMoods button small{display:block;font-size:8px;margin-top:3px}.mpMoods button.on{background:#192F5A;color:#fff;border-color:#192F5A}
      #mpFeedback{width:100%;min-height:80px;resize:vertical;border:1px solid #d8dde6;border-radius:11px;padding:10px;font:12px Arial}.mpExportActions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}.mpExportSend,.mpExportCancel{border:0;border-radius:11px;padding:12px;font-weight:900}.mpExportSend{background:#F25353;color:#fff}.mpExportCancel{background:#e9edf3;color:#344054}
    `;
    document.head.appendChild(style);
  }

  let savedStatusTimer;
  function showSaved() {
    let status = document.getElementById('mpSavedStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'mpSavedStatus';
      status.textContent = 'SALVO NESTE APARELHO';
      document.body.appendChild(status);
    }
    status.classList.add('on');
    clearTimeout(savedStatusTimer);
    savedStatusTimer = setTimeout(() => status.classList.remove('on'), 900);
  }

  let toastTimer;
  function showToast(message, error) {
    let toast = document.getElementById('mpToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mpToast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('error', Boolean(error));
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 2600);
  }

  function createExportModal() {
    if (document.getElementById('mpExportModal')) return;
    const modal = document.createElement('div');
    modal.id = 'mpExportModal';
    modal.innerHTML = `
      <div class="mpExportSheet">
        <h3 id="mpExportTitle">Treino concluído</h3>
        <p id="mpExportText">Como você se sentiu? O arquivo com as cargas será preparado para envio ao Marco.</p>
        <div class="mpMoods">
          <button type="button" data-mood="Muito bem">😍<small>Muito bem</small></button>
          <button type="button" data-mood="Bem">🙂<small>Bem</small></button>
          <button type="button" data-mood="Normal">😐<small>Normal</small></button>
          <button type="button" data-mood="Cansado(a)">😓<small>Cansado</small></button>
          <button type="button" data-mood="Muito cansado(a)">😣<small>Muito cansado</small></button>
        </div>
        <textarea id="mpFeedback" placeholder="Feedback, dor, dificuldade, carga leve ou pesada..."></textarea>
        <div class="mpExportActions">
          <button class="mpExportSend" type="button">GERAR ARQUIVO E ENVIAR</button>
          <button class="mpExportCancel" type="button">FECHAR</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-mood]').forEach(button => button.addEventListener('click', () => {
      modal.querySelectorAll('[data-mood]').forEach(item => item.classList.remove('on'));
      button.classList.add('on');
    }));
    modal.querySelector('.mpExportCancel').addEventListener('click', closeExportModal);
    modal.querySelector('.mpExportSend').addEventListener('click', () => {
      const mood = modal.querySelector('[data-mood].on')?.dataset.mood || '';
      const feedback = modal.querySelector('#mpFeedback').value.trim();
      exportWorkout(mood, feedback);
    });
  }

  function openExportModal() {
    createExportModal();
    const modal = document.getElementById('mpExportModal');
    const context = { week: currentWeek(), day: currentDay() };
    const checkout = isFinalWorkout(context);
    modal.querySelector('#mpExportTitle').textContent = checkout ? 'Check-out final do ciclo' : 'Treino concluído';
    modal.querySelector('#mpExportText').textContent = checkout
      ? 'Último treino da Semana 4. Serão gerados o arquivo de hoje e o check-out completo das quatro semanas.'
      : 'Como você se sentiu? O mini arquivo com as cargas de hoje será preparado para envio ao Marco.';
    modal.querySelector('.mpExportSend').textContent = checkout ? 'GERAR CHECK-OUT E ENVIAR' : 'GERAR ARQUIVO E ENVIAR';
    modal.classList.add('on');
  }

  function closeExportModal() {
    document.getElementById('mpExportModal')?.classList.remove('on');
  }

  function closeLegacyFeedback() {
    document.querySelector('.feedback.on')?.classList.remove('on');
  }

  function legacyMoodAndFeedback() {
    const selected = document.querySelector('.feedback .moods button.on');
    const mood = selected?.querySelector('small')?.textContent || selected?.textContent?.trim() || '';
    const feedback = document.querySelector('.feedback textarea, #note')?.value?.trim() || '';
    return { mood, feedback };
  }

  function integrateFinishFlow() {
    if (typeof window.finishWorkout === 'function') {
      const originalFinish = window.finishWorkout;
      window.finishWorkout = function () {
        const result = originalFinish.apply(this, arguments);
        openExportModal();
        return result;
      };
      finishWrapped = true;
    }

    if (typeof window.send === 'function' && document.querySelector('.feedback')) {
      window.send = function () {
        const values = legacyMoodAndFeedback();
        exportWorkout(values.mood, values.feedback);
      };
      const sendButton = document.querySelector('.feedback .send');
      if (sendButton) sendButton.textContent = 'Gerar arquivo e enviar para Marco';
    }

    document.addEventListener('click', event => {
      const button = event.target.closest('button.finish, .finish button');
      if (!button || finishWrapped || document.querySelector('.feedback')) return;
      setTimeout(openExportModal, 0);
    });
  }

  function init() {
    addStyles();
    createExportModal();
    restoreInputs();
    integrateFinishFlow();

    document.addEventListener('input', event => {
      const input = event.target.closest('.set input');
      if (!input || restoring) return;
      saveSet(input.closest('.set'), true);
    });
    document.addEventListener('change', event => {
      const input = event.target.closest('.set input');
      if (!input || restoring) return;
      saveSet(input.closest('.set'), true);
    });
    document.addEventListener('click', event => {
      const check = event.target.closest('.set .check');
      if (!check) return;
      setTimeout(() => saveSet(check.closest('.set'), true), 0);
    });

    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => [...mutation.addedNodes].some(node => {
        if (node.nodeType !== 1) return false;
        return node.matches?.('.set, .card, #workoutContent, #main') || Boolean(node.querySelector?.('.set'));
      }));
      if (relevant) scheduleRestore();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
