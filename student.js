window.StudentApp = {
  container: null,
  teamId: null,
  currentState: null,
  draggedCard: null,
  localAnswers: [],
  touchDragData: null,
  touchGhost: null,
  _touchOffsetX: 0,
  _touchOffsetY: 0,

  init(container) {
    this.container = container;
    
    window.STORE.listen(state => {
      this.currentState = state;
      this.render();
    });
    
    this.currentState = window.STORE.get();
    this.render();

    // 터치 드래그 지원 (태블릿/모바일)
    this._touchStartFn = this.handleTouchStart.bind(this);
    this._touchMoveFn  = this.handleTouchMove.bind(this);
    this._touchEndFn   = this.handleTouchEnd.bind(this);
    this.container.addEventListener('touchstart', this._touchStartFn, { passive: false });
    this.container.addEventListener('touchmove',  this._touchMoveFn,  { passive: false });
    this.container.addEventListener('touchend',   this._touchEndFn,   { passive: false });
  },

  render() {
    if (!this.teamId) {
      this.renderTeamSelection();
      return;
    }

    const st = this.currentState;
    
    if (st.status === 'lobby') {
      this.container.innerHTML = `
        <div class="glass-panel" style="text-align: center; margin-top: 10vh;">
          <h2>${this.teamId}모둠으로 접속했습니다!</h2>
          <p style="margin-top: 1rem; font-size: 1.2rem; color: var(--text-light)">선생님이 시작할 때까지 기다려주세요...</p>
          <div style="margin-top: 2rem; font-size: 3rem;">⏳</div>
        </div>
      `;
    } else if (st.status === 'waiting_next') {
      this.container.innerHTML = `
        <div class="glass-panel" style="text-align: center; margin-top: 10vh;">
          <h2>선생님이 다음 문제를 준비 중입니다...</h2>
          <div style="margin-top: 2rem; font-size: 3rem;">⏳</div>
        </div>
      `;
    } else if (st.status === 'question' || st.status === 'submitted') {
      if (st.submissions && st.submissions[this.teamId]) {
         // Show O/X only
         this.renderGrading(false, false);
      } else {
         this.renderQuestion();
      }
    } else if (st.status === 'score_popup') {
      this.renderGrading(true, false);
    } else if (st.status === 'chart_view') {
      this.renderChartOnly();
    } else if (st.status === 'final_ranking') {
      this.renderFinalRanking();
    }
  },

  renderTeamSelection() {
    let html = `<h1 class="title">모둠을 선택하세요</h1><div class="team-grid">`;
    for(let i=1; i<=8; i++) {
      html += `<button class="team-btn" onclick="window.StudentApp.selectTeam(${i})">${i}모둠</button>`;
    }
    html += `</div>`;
    this.container.innerHTML = html;
  },

  selectTeam(id) {
    this.teamId = id;
    window.STORE.joinTeam(id);
    this.render();
  },

  renderQuestion() {
    const st = this.currentState;
    const qData = window.GAME_DATA.QUESTIONS[st.currentQuestionIndex];
    const isSubmitted = !!(st.submissions[this.teamId]);
    
    // Initialize local answers array if needed
    let totalBlanks = 0;
    qData.sentences.forEach(s => totalBlanks += s.blanks.length);
    if (this.currentQuestionIndex !== st.currentQuestionIndex || this.localAnswers.length !== totalBlanks) {
      this.currentQuestionIndex = st.currentQuestionIndex;
      this.localAnswers = new Array(totalBlanks).fill(null);
    }

    let sentencesHtml = '';
    let blankIndex = 0;
    
    qData.sentences.forEach(s => {
      let sHtml = '<p>';
      for(let i=0; i<s.parts.length; i++) {
        sHtml += s.parts[i];
        if (i < s.parts.length - 1) {
          const currentWord = this.localAnswers[blankIndex] || '';
          const lockedHTML = currentWord ? `<div class="word-card in-slot" draggable="${!isSubmitted}" ondragstart="window.StudentApp.drag(event)" data-source-index="${blankIndex}" data-word="${currentWord}">${currentWord}</div>` : '';
          
          sHtml += `
            <div class="drop-zone ${currentWord ? 'filled' : ''}" 
                 data-index="${blankIndex}"
                 ondrop="window.StudentApp.drop(event)" 
                 ondragover="window.StudentApp.allowDrop(event)"
                 ondragenter="this.classList.add('drag-over')"
                 ondragleave="this.classList.remove('drag-over')">
              ${lockedHTML}
            </div>`;
          blankIndex++;
        }
      }
      sHtml += '</p><br>';
      sentencesHtml += sHtml;
    });

    // Create cards based on words not used
    let cardsHtml = '';
    qData.cards.forEach(word => {
      if (!this.localAnswers.includes(word)) { // Do not show if already in slot
        cardsHtml += `<div class="word-card" draggable="${!isSubmitted}" ondragstart="window.StudentApp.drag(event)" data-word="${word}">${word}</div>`;
      }
    });

    const isComplete = this.localAnswers.every(ans => ans !== null);

    this.container.innerHTML = `
      <div class="glass-panel">
        <h2 style="color: var(--primary); margin-bottom: 2rem;">${qData.title}</h2>
        <div class="question-container">
          ${sentencesHtml}
        </div>
        
        <div style="margin-bottom: 1rem; font-weight: bold; color: var(--text-light)">아래 단어를 드래그하여 빈칸에 넣으세요:</div>
        <div class="cards-container" 
             ondrop="window.StudentApp.dropBackToPool(event)" 
             ondragover="window.StudentApp.allowDrop(event)">
          ${cardsHtml}
        </div>

        <div style="margin-top: 2rem; text-align: right;">
          ${isSubmitted 
            ? `<div style="color: var(--success); font-weight: bold; font-size: 1.5rem">제출 완료! 다른 모둠을 기다리는 중...</div>`
            : `<button class="btn btn-success" style="font-size: 1.5rem; padding: 1.5rem 3rem;" 
                  ${!isComplete ? 'disabled' : ''} 
                  onclick="window.StudentApp.submitAnswers()">📝 완료</button>`
          }
        </div>
      </div>
    `;
  },

  drag(ev) {
    if (this.currentState.submissions[this.teamId]) return; // Locked
    const word = ev.target.dataset.word;
    const sourceIndex = ev.target.dataset.sourceIndex;
    ev.dataTransfer.setData("text", JSON.stringify({ word, sourceIndex }));
    this.draggedCard = ev.target;
  },

  allowDrop(ev) {
    ev.preventDefault();
  },

  drop(ev) {
    ev.preventDefault();
    if (this.currentState.submissions[this.teamId]) return; // Locked
    
    let dropZone = ev.target;
    // Handle drop onto existing child card
    if (!dropZone.classList.contains('drop-zone')) {
      dropZone = dropZone.closest('.drop-zone');
    }
    
    dropZone.classList.remove('drag-over');

    const data = JSON.parse(ev.dataTransfer.getData("text"));
    const targetIndex = dropZone.dataset.index;
    
    // Clean old location
    if (data.sourceIndex !== undefined) {
      this.localAnswers[data.sourceIndex] = null;
    }
    
    // Swap if there is already a word here (it will go back to pool since we don't handle swap yet)
    this.localAnswers[targetIndex] = data.word;
    this.render();
  },

  dropBackToPool(ev) {
    ev.preventDefault();
    const data = JSON.parse(ev.dataTransfer.getData("text"));
    if (data.sourceIndex !== undefined) {
      this.localAnswers[data.sourceIndex] = null;
      this.render();
    }
  },

  submitAnswers() {
    const timeNow = Date.now();
    window.STORE.update(state => {
      // Ensure submissions object exists
      if (!state.submissions) state.submissions = {};
      state.submissions[this.teamId] = {
        answers: this.localAnswers,
        submitTime: timeNow
      };
    });
  },

  renderGrading(showPopup, showChart) {
    const st = this.currentState;
    const sub = st.submissions[this.teamId];
    if (!sub) {
       this.container.innerHTML = `<div class="glass-panel" style="text-align:center"><h1>제출하지 못했습니다 😢</h1><div class="chart-container" id="chartArea"></div></div>`;
       if (showChart) this.renderChart();
       return;
    }

    const qData = window.GAME_DATA.QUESTIONS[st.currentQuestionIndex];
    let correctAnswers = [];
    qData.sentences.forEach(s => correctAnswers.push(...s.blanks));

    let totalBlanks = correctAnswers.length;
    let correctCount = 0;
    
    let sentencesHtml = '';
    let blankIndex = 0;
    qData.sentences.forEach(s => {
      let sHtml = '<p>';
      for(let i=0; i<s.parts.length; i++) {
        sHtml += s.parts[i];
        if (i < s.parts.length - 1) {
          const userAns = sub.answers[blankIndex];
          const isCorrect = userAns === correctAnswers[blankIndex];
          if (isCorrect) correctCount++;
          
          const markHTML = isCorrect ? `<span class="mark-ox mark-o">⭕</span>` : `<span class="mark-ox mark-x">❌</span>`;
          const fixLabel = !isCorrect ? `<div style="color:var(--danger); font-size:1rem; font-weight:bold; position:absolute; bottom:-30px; width:100%; text-align:center;">정답: ${correctAnswers[blankIndex]}</div>` : '';
          
          sHtml += `
            <div class="drop-zone filled" style="position:relative; margin-bottom: 25px;">
              <div class="word-card in-slot">${userAns || ''}</div>
              ${markHTML}
              ${fixLabel}
            </div>`;
          blankIndex++;
        }
      }
      sHtml += '</p><br>';
      sentencesHtml += sHtml;
    });

    let html = `
      <div class="glass-panel">
        <h2 style="color: var(--primary); margin-bottom: 2rem;">채점 결과</h2>
        <div class="question-container">
          ${sentencesHtml}
        </div>
        <div class="chart-container" id="chartArea"></div>
      </div>
    `;

    // Pop-up calculation overlay
    if (showPopup && sub.speedRank) {
      const speedBonus = sub.speedRank === 1 ? 1.5 : (sub.speedRank === 2 ? 1.0 : (sub.speedRank === 3 ? 0.5 : 0));
      const allCorrectBonus = (correctCount === totalBlanks) ? 1.0 : 0;
      
      html += `
        <div class="grading-overlay" id="scorePopup" onclick="this.style.display='none'">
          <div class="score-popup" onclick="event.stopPropagation()">
            <h2 style="margin-bottom: 2rem; color: var(--primary)">${this.teamId}모둠 점수 계산서</h2>
            <div class="score-row">
              <span>정답 ${correctCount}개</span>
              <span>${correctCount}점</span>
            </div>
            <div class="score-row" style="color: var(--success)">
              <span>스피드 보너스 (${sub.speedRank || '-'}등)</span>
              <span>+${speedBonus}점!</span>
            </div>
            <div class="score-row" style="color: var(--danger)">
              <span>전체 정답 보너스</span>
              <span>+${allCorrectBonus}점!</span>
            </div>
            <div class="score-total">
              총점: ${correctCount + speedBonus + allCorrectBonus}점
            </div>
            <button class="btn btn-primary" style="margin-top: 2rem; width: 100%" onclick="document.getElementById('scorePopup').style.display='none'">확인</button>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = html;
    
    if (showChart) {
      setTimeout(() => this.renderChart(), 50);
    }
  },

  renderChartOnly() {
    this.container.innerHTML = `
      <div class="glass-panel" style="display: flex; flex-direction: column; height: 75vh;">
        <h2 style="color: var(--primary); margin-bottom: 2rem; text-align: center;">현재 모둠별 누적 점수 📊</h2>
        <div class="chart-container" id="chartArea" style="flex: 1; min-height: 0; padding-bottom: 1rem;"></div>
      </div>
    `;
    setTimeout(() => this.renderChart(), 50);
  },

  renderChart() {
    const chartArea = document.getElementById('chartArea');
    if (!chartArea) return;
    
    const maxScore = Math.max(10, ...Object.values(this.currentState.teamScores));
    
    let chartHtml = '';
    for(let i=1; i<=8; i++) {
      const score = this.currentState.teamScores[i];
      const heightPercent = (score / maxScore) * 100;
      chartHtml += `
        <div class="bar-wrapper">
          <div class="bar-label">${i}모둠</div>
          <div style="height: 100%; width: 50%; display:flex; flex-direction:column; justify-content:flex-end">
            <div class="bar" style="height: 0%" data-target-height="${heightPercent}%">
              <div class="bar-score">${score}</div>
            </div>
          </div>
        </div>
      `;
    }
    chartArea.innerHTML = chartHtml;

    // Trigger animation
    setTimeout(() => {
      chartArea.querySelectorAll('.bar').forEach(bar => {
        bar.style.height = bar.dataset.targetHeight;
      });
    }, 100);
  },

  renderFinalRanking() {
    const scores = this.currentState.teamScores;
    const ranked = Object.entries(scores).sort((a,b) => b[1] - a[1]);
    
    let rankHtml = `
      <div class="glass-panel" style="text-align: center;">
        <h1 class="title animate-slide" style="margin-bottom: 3rem;">🏆 최종 순위 발표 🏆</h1>
        <div class="podium-container" style="display: flex; justify-content: center; align-items: flex-end; gap: 1rem; margin-bottom: 3rem; height: 320px;">
    `;
    
    const top3 = ranked.slice(0, 3);
    const podiumOrder = [
      { rank: 2, data: top3[1], height: '180px', color: '#C0C0C0' },
      { rank: 1, data: top3[0], height: '230px', color: '#FFD700' },
      { rank: 3, data: top3[2], height: '140px', color: '#CD7F32' }
    ];

    podiumOrder.forEach(item => {
      if (item.data) {
        rankHtml += `
          <div style="display: flex; flex-direction: column; align-items: center; width: 120px; animation: slideUp 1s ease forwards; opacity: 0; transform: translateY(50px);">
            <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem; color: var(--text)">${item.data[0]}모둠</div>
            <div style="font-size: 1.2rem; color: var(--text-light); margin-bottom: 0.5rem;">${item.data[1]}점</div>
            <div style="width: 100%; height: ${item.height}; background: linear-gradient(180deg, ${item.color} 0%, rgba(255,255,255,0.2) 100%); border-radius: 10px 10px 0 0; display: flex; justify-content: center; align-items: center; font-size: 3rem; box-shadow: 0 -5px 15px rgba(0,0,0,0.1); border-top: 5px solid ${item.color};">
              ${item.rank}
            </div>
          </div>
        `;
      }
    });

    rankHtml += `</div><div style="max-width: 600px; margin: 0 auto; text-align: left;">`;
    
    ranked.forEach(([team, score], index) => {
      if (index >= 3) {
        rankHtml += `
          <div style="display: flex; justify-content: space-between; padding: 1rem 1.5rem; background: rgba(255,255,255,0.5); border-radius: 10px; margin-bottom: 0.5rem; font-size: 1.2rem;">
            <span>${index+1}위 - ${team}모둠</span>
            <span>${score}점</span>
          </div>
        `;
      }
    });
    
    rankHtml += `</div></div>`;
    
    if (!document.getElementById('podium-styles')) {
       const style = document.createElement('style');
       style.id = 'podium-styles';
       style.innerHTML = `
         @keyframes slideUp {
           to { opacity: 1; transform: translateY(0); }
         }
         .podium-container > div:nth-child(1) { animation-delay: 0.5s !important; }
         .podium-container > div:nth-child(2) { animation-delay: 1.0s !important; }
         .podium-container > div:nth-child(3) { animation-delay: 0s !important; }
       `;
       document.head.appendChild(style);
    }

    this.container.innerHTML = rankHtml;
  },

  // ─── 터치 드래그앤드롭 핸들러 ───────────────────────────────────────────

  handleTouchStart(ev) {
    const card = ev.target.closest('.word-card');
    if (!card) return;
    // 이미 제출된 경우 잠금
    if (this.currentState && this.currentState.submissions && this.currentState.submissions[this.teamId]) return;

    ev.preventDefault();

    const touch = ev.touches[0];
    const rect  = card.getBoundingClientRect();

    this.touchDragData = {
      word:        card.dataset.word,
      sourceIndex: card.dataset.sourceIndex  // 슬롯 카드면 존재, 풀 카드면 undefined
    };

    // 손가락을 따라다니는 고스트 엘리먼트 생성
    const ghost = card.cloneNode(true);
    ghost.id = 'touch-drag-ghost';
    ghost.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:9999',
      'opacity:0.85',
      'transform:scale(1.12) rotate(2deg)',
      'transition:none',
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      'margin:0'
    ].join(';');
    document.body.appendChild(ghost);
    this.touchGhost   = ghost;
    this._touchOffsetX = touch.clientX - rect.left;
    this._touchOffsetY = touch.clientY - rect.top;
  },

  handleTouchMove(ev) {
    if (!this.touchDragData) return;
    ev.preventDefault();

    const touch = ev.touches[0];

    // 고스트 위치 업데이트
    if (this.touchGhost) {
      this.touchGhost.style.left = (touch.clientX - this._touchOffsetX) + 'px';
      this.touchGhost.style.top  = (touch.clientY - this._touchOffsetY) + 'px';
    }

    // 고스트를 잠깐 숨겨서 아래 엘리먼트를 감지
    if (this.touchGhost) this.touchGhost.style.visibility = 'hidden';
    const elBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    if (this.touchGhost) this.touchGhost.style.visibility = '';

    // drag-over 하이라이트 갱신
    document.querySelectorAll('.drop-zone.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (elBelow) {
      const zone = elBelow.closest('.drop-zone');
      if (zone) zone.classList.add('drag-over');
    }
  },

  handleTouchEnd(ev) {
    if (!this.touchDragData) return;
    ev.preventDefault();

    const touch = ev.changedTouches[0];

    // 고스트 제거
    if (this.touchGhost) {
      this.touchGhost.remove();
      this.touchGhost = null;
    }
    document.querySelectorAll('.drop-zone.drag-over').forEach(el => el.classList.remove('drag-over'));

    // 손가락 아래 엘리먼트 파악
    const elBelow    = document.elementFromPoint(touch.clientX, touch.clientY);
    const dropZone   = elBelow && elBelow.closest('.drop-zone');
    const cardsPool  = elBelow && elBelow.closest('.cards-container');

    const data = this.touchDragData;
    this.touchDragData = null;

    if (dropZone) {
      const targetIndex = parseInt(dropZone.dataset.index);
      // 기존 슬롯에서 꺼내기
      if (data.sourceIndex !== undefined && data.sourceIndex !== '') {
        this.localAnswers[parseInt(data.sourceIndex)] = null;
      }
      // 대상 슬롯에 단어 배치
      this.localAnswers[targetIndex] = data.word;
      this.render();
    } else if (cardsPool && data.sourceIndex !== undefined && data.sourceIndex !== '') {
      // 단어 풀로 되돌리기
      this.localAnswers[parseInt(data.sourceIndex)] = null;
      this.render();
    }
  }
};
