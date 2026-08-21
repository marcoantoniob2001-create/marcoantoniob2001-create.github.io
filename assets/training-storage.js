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
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item';
  }

  function activeButton(selector) {
    return document.querySelector(
      `${selector} button.on, ${selector} button.active, ${selector} button[aria-selected="true"]`
    );
  }

  function currentWeek() {
    const button =
      activeButton('.weeks') ||
      document.querySelector('.weeks button');

    const value =
      button?.dataset.week ||
      button?.textContent?.match(/\d+/)?.[0];

    return Number(value || 1);
  }

  function currentDay() {
    const buttons = [...document.querySelectorAll('.days button')];
    const button = activeButton('.days') || buttons[0];
    const index = Math.max(0, buttons.indexOf(button));
    const id = button?.dataset.day || String(index);
    const label = (button?.textContent || `Dia ${index + 1}`).trim();

    return {
      id: slug(id),
      label,
      index
    };
  }

  function exerciseName(card, index) {
    return (
      card.querySelector('.name, .exercise-name, h3, h4')?.textContent ||
      `Exercício ${index + 1}`
    ).trim();
  }

  function setNumber(set, index) {
    const text = [...set.querySelectorAll('span, b')]
      .map(element => element.textContent)
      .join(' ');

    return Number(
      text.match(/s[eé]rie\s*(\d+)/i)?.[1] ||
      index + 1
    );
  }

  function fieldName(input, index) {
    const hint =
      `${input.name || ''} ${input.placeholder || ''}`.toLowerCase();

    if (/kg|carga|peso/.test(hint)) return 'load';
    if (/rep/.test(hint)) return 'reps';
    if (/rir/.test(hint)) return 'rir';
    if (/pace/.test(hint)) return 'pace';
    if (/tempo|time/.test(hint)) return 'time';
    if (/rpe|int\.?|intens/.test(hint)) return 'intensity';

    return `field${index + 1}`;
  }

  function setContext(set) {
    const card =
      set.closest('.card, .exercise-card, section');

    if (!card) return null;

    const cards = [
      ...document.querySelectorAll(
        '#workoutContent .card, #main .card, .exercise-card'
      )
    ];

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
    const text = [...set.querySelectorAll('span')]
      .map(element => element.textContent.trim())
      .find(value => /^RIR\s*/i.test(value));

    return text
      ? text.replace(/^RIR\s*/i, '').trim()
      : '';
  }

  function saveSet(set, persist) {
    const context = setContext(set);

    if (!context) return;

    const record = ensureRecord(context);

    [...set.querySelectorAll('input')]
      .forEach((input, index) => {
        record.fields[fieldName(input, index)] =
          input.value.trim();
      });

    if (!record.fields.rir) {
      record.fields.rir = readStaticRir(set);
    }

    const check = set.querySelector('.check');

    if (check) {
      record.done =
        check.classList.contains('done') ||
        check.textContent.trim() === '✓';
    }

    record.updatedAt = new Date().toISOString();

    if (persist) saveState();
  }

  function restoreInputs() {
    if (restoring) return;

    restoring = true;

    document.querySelectorAll('.set').forEach(set => {
      const context = setContext(set);

      if (!context) return;

      const record = state.records[context.id];

      if (!record) return;

      [...set.querySelectorAll('input')]
        .forEach((input, index) => {
          const saved =
            record.fields[fieldName(input, index)];

          if (saved !== undefined && saved !== '') {
            input.value = saved;
          }
        });

      const check = set.querySelector('.check');

      if (check && record.done) {
        check.classList.add('done');
        check.textContent = '✓';
      }
    });

    restoring = false;

    try {
      if (typeof window.updateProgress === 'function') {
        window.updateProgress();
      } else if (typeof window.progress === 'function') {
        window.progress();
      }
    } catch (_) {}
  }

  function scheduleRestore() {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreInputs, 40);
  }

  function collectCurrentWorkout() {
    document.querySelectorAll('.set').forEach(set => {
      saveSet(set, false);
    });

    saveState();
  }

  function feedbackMessage(mood, feedback) {
    const day = currentDay();
    const week = currentWeek();

    const checks = [
      ...document.querySelectorAll(
        '#workoutContent .check, #main .check'
      )
    ];

    const completed = checks.filter(check =>
      check.classList.contains('done')
    ).length;

    return [
      `Treino concluído - ${config.protocolName}`,
      '',
      `Dia: ${day.label}`,
      `Semana: ${week}/4`,
      `Séries concluídas: ${completed}/${checks.length}`,
      `Percepção: ${mood || 'Não informado'}`,
      `Feedback: ${feedback || 'Sem observações'}`
    ].join('\n');
  }

  function sendFeedback() {
    collectCurrentWorkout();

    const modal =
      document.getElementById('mpFeedbackModal');

    const mood =
      modal
        ?.querySelector('[data-mood].on')
        ?.dataset.mood || '';

    const feedback =
      modal
        ?.querySelector('#mpFeedbackText')
        ?.value
        .trim() || '';

    const message =
      feedbackMessage(mood, feedback);

    const whatsapp =
      `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(message)}`;

    window.open(whatsapp, '_blank');
  }

  function addStyles() {
    if (document.getElementById('mp-storage-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'mp-storage-style';

    style.textContent = `
      #mpSavedStatus {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 9997;
        background: #192F5A;
        color: #fff;
        border-radius: 999px;
        padding: 8px 11px;
        font: 800 10px Arial;
        opacity: 0;
        transform: translateY(8px);
        transition: .2s;
        pointer-events: none;
        box-shadow: 0 6px 18px #0003;
      }

      #mpSavedStatus.on {
        opacity: 1;
        transform: translateY(0);
      }

      #mpToast {
        position: fixed;
        left: 50%;
        top: 16px;
        transform: translate(-50%, -10px);
        z-index: 10002;
        background: #192F5A;
        color: #fff;
        border-radius: 12px;
        padding: 11px 14px;
        font: 800 12px Arial;
        opacity: 0;
        transition: .2s;
        box-shadow: 0 8px 24px #0004;
        text-align: center;
        max-width: calc(100% - 28px);
      }

      #mpToast.on {
        opacity: 1;
        transform: translate(-50%, 0);
      }

      #mpToast.error {
        background: #9f2d2d;
      }

      #mpFeedbackModal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: #000b;
        display: none;
        align-items: flex-end;
        justify-content: center;
        padding: 12px;
      }

      #mpFeedbackModal.on {
        display: flex;
      }

      .mpFeedbackSheet {
        width: min(620px, 100%);
        background: #fff;
        color: #172033;
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 20px 60px #0006;
        font-family: Arial, sans-serif;
      }

      .mpFeedbackSheet h3 {
        margin: 0;
        color: #192F5A;
        font-size: 20px;
      }

      .mpFeedbackSheet p {
        font-size: 12px;
        color: #667085;
        line-height: 1.45;
      }

      .mpMoods {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 5px;
        margin: 12px 0;
      }

      .mpMoods button {
        border: 1px solid #d8dde6;
        background: #f5f6f8;
        color: #344054;
        border-radius: 11px;
        padding: 8px 2px;
        font-size: 18px;
      }

      .mpMoods button small {
        display: block;
        font-size: 8px;
        margin-top: 3px;
      }

      .mpMoods button.on {
        background: #192F5A;
        color: #fff;
        border-color: #192F5A;
      }

      #mpFeedbackText {
        width: 100%;
        min-height: 80px;
        resize: vertical;
        border: 1px solid #d8dde6;
        border-radius: 11px;
        padding: 10px;
        font: 12px Arial;
      }

      .mpFeedbackActions {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        margin-top: 10px;
      }

      .mpFeedbackSend,
      .mpFeedbackClose {
        border: 0;
        border-radius: 11px;
        padding: 12px;
        font-weight: 900;
      }

      .mpFeedbackSend {
        background: #F25353;
        color: #fff;
      }

      .mpFeedbackClose {
        background: #e9edf3;
        color: #344054;
      }
    `;

    document.head.appendChild(style);
  }

  let savedStatusTimer;

  function showSaved() {
    let status =
      document.getElementById('mpSavedStatus');

    if (!status) {
      status = document.createElement('div');
      status.id = 'mpSavedStatus';
      status.textContent = 'SALVO NESTE APARELHO';
      document.body.appendChild(status);
    }

    status.classList.add('on');
    clearTimeout(savedStatusTimer);

    savedStatusTimer = setTimeout(() => {
      status.classList.remove('on');
    }, 900);
  }

  let toastTimer;

  function showToast(message, error) {
    let toast =
      document.getElementById('mpToast');

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mpToast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.toggle(
      'error',
      Boolean(error)
    );

    toast.classList.add('on');
    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.classList.remove('on');
    }, 2600);
  }

  function createFeedbackModal() {
    if (
      document.querySelector('.feedback') ||
      document.getElementById('mpFeedbackModal')
    ) {
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'mpFeedbackModal';

    modal.innerHTML = `
      <div class="mpFeedbackSheet">
        <h3>Treino concluído</h3>

        <p>Como você se sentiu?</p>

        <div class="mpMoods">
          <button type="button" data-mood="Muito bem">
            😍
            <small>Muito bem</small>
          </button>

          <button type="button" data-mood="Bem">
            🙂
            <small>Bem</small>
          </button>

          <button type="button" data-mood="Normal">
            😐
            <small>Normal</small>
          </button>

          <button type="button" data-mood="Cansado(a)">
            😓
            <small>Cansado</small>
          </button>

          <button type="button" data-mood="Muito cansado(a)">
            😣
            <small>Muito cansado</small>
          </button>
        </div>

        <textarea
          id="mpFeedbackText"
          placeholder="Feedback, dor, dificuldade, carga leve ou pesada..."
        ></textarea>

        <div class="mpFeedbackActions">
          <button
            class="mpFeedbackSend"
            type="button"
          >
            ENVIAR PARA MARCO NO WHATSAPP
          </button>

          <button
            class="mpFeedbackClose"
            type="button"
          >
            FECHAR
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal
      .querySelectorAll('[data-mood]')
      .forEach(button => {
        button.addEventListener('click', () => {
          modal
            .querySelectorAll('[data-mood]')
            .forEach(item =>
              item.classList.remove('on')
            );

          button.classList.add('on');
        });
      });

    modal
      .querySelector('.mpFeedbackSend')
      .addEventListener(
        'click',
        sendFeedback
      );

    modal
      .querySelector('.mpFeedbackClose')
      .addEventListener(
        'click',
        closeFeedbackModal
      );
  }

  function openFeedbackModal() {
    collectCurrentWorkout();
    createFeedbackModal();

    document
      .getElementById('mpFeedbackModal')
      ?.classList.add('on');
  }

  function closeFeedbackModal() {
    document
      .getElementById('mpFeedbackModal')
      ?.classList.remove('on');
  }

  function integrateFinishFlow() {
    if (document.querySelector('.feedback')) {
      return;
    }

    if (typeof window.finishWorkout === 'function') {
      const originalFinish =
        window.finishWorkout;

      window.finishWorkout = function () {
        const result =
          originalFinish.apply(this, arguments);

        openFeedbackModal();

        return result;
      };

      finishWrapped = true;
    }

    document.addEventListener('click', event => {
      const button =
        event.target.closest(
          'button.finish, .finish button'
        );

      if (!button || finishWrapped) return;

      setTimeout(openFeedbackModal, 0);
    });
  }

  function init() {
    addStyles();
    createFeedbackModal();
    restoreInputs();
    integrateFinishFlow();

    document.addEventListener('input', event => {
      const input =
        event.target.closest('.set input');

      if (!input || restoring) return;

      saveSet(
        input.closest('.set'),
        true
      );
    });

    document.addEventListener('change', event => {
      const input =
        event.target.closest('.set input');

      if (!input || restoring) return;

      saveSet(
        input.closest('.set'),
        true
      );
    });

    document.addEventListener('click', event => {
      const check =
        event.target.closest('.set .check');

      if (!check) return;

      setTimeout(() => {
        saveSet(
          check.closest('.set'),
          true
        );
      }, 0);
    });

    const observer =
      new MutationObserver(mutations => {
        const relevant =
          mutations.some(mutation =>
            [...mutation.addedNodes]
              .some(node => {
                if (node.nodeType !== 1) {
                  return false;
                }

                return (
                  node.matches?.(
                    '.set, .card, #workoutContent, #main'
                  ) ||
                  Boolean(
                    node.querySelector?.('.set')
                  )
                );
              })
          );

        if (relevant) {
          scheduleRestore();
        }
      });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }
})();
