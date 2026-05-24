window.TeacherApp = {
  container: null,
  currentState: null,

  init(container) {
    this.container = container;
    
    // Clear state on teacher init for fresh start
    if (!window.STORE.get().startTime && window.STORE.get().status === 'lobby') {
      window.STORE.reset();
    }
    
    window.STORE.listen(state => {
      this.currentState = state;
      this.render();
    });
    
    this.currentState = window.STORE.get();
    this.render();
  },

  render() {
    const st = this.currentState;

    if (st.status === 'lobby') {
      this.renderLobby();
    } else if (st.status === 'question' || st.status === 'submitted') {
      this.renderQuestionStatus();
    } else if (st.status === 'waiting_next') {
      this.renderWaitingNext();
    } else if (st.status === 'score_popup') {
      this.renderScorePopupDash();
    } else if (st.status === 'chart_view') {
      this.renderChartDash();
    } else if (st.status === 'final_ranking') {
      this.renderFinalRanking();
    }
  },

  renderLobby() {
    const st = this.currentState;
    const connected = st.connectedTeams || [];
    let teamCardsHtml = '';
    for(let i=1; i<=8; i++) {
      const isHere = connected.includes(i);
      teamCardsHtml += `
        <div class="team-status-card">
          <h2>${i}모둠</h2>
          ${isHere 
            ? `<span class="status-badge status-submitted">✅ 입장완료</span>` 
            : `<span class="status-badge status-waiting">대기중...</span>`}
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="glass-panel" style="text-align: center">
        <h1 class="title">교사용 관리자 페이지</h1>
        <p style="font-size: 1.2rem; margin-bottom: 2rem;">학생들이 모둠을 선택하고 들어올 때까지 대기하세요.<br>모두 준비되면 아래 시작 버튼을 눌러주세요.</p>
        
        <div class="teacher-grid" style="margin-bottom: 2rem; text-align: left;">
          ${teamCardsHtml}
        </div>

        <button class="btn btn-success" style="font-size: 2rem; padding: 1rem 4rem;" onclick="window.TeacherApp.startGame()">게임 시작하기 🚀</button>
      </div>
    `;
  },

  renderWaitingNext() {
    const st = this.currentState;
    const qData = window.GAME_DATA.QUESTIONS[st.currentQuestionIndex];
    this.container.innerHTML = `
      <div class="glass-panel" style="text-align: center">
        <h1 class="title">다음 문제 준비 완료</h1>
        <p style="font-size: 1.2rem; margin-bottom: 2rem;">학생들은 대기 화면을 보고 있습니다.<br>아래 버튼을 누르면 시작됩니다.</p>
        <button class="btn btn-primary" style="font-size: 2rem; padding: 1rem 4rem;" onclick="window.TeacherApp.startPreparedQuestion()">[${qData.title}] 시작하기 🚀</button>
      </div>
    `;
  },

  renderQuestionStatus() {
    const st = this.currentState;
    const qData = window.GAME_DATA.QUESTIONS[st.currentQuestionIndex];
    
    // Check submissions
    const submittedCount = Object.keys(st.submissions).length;
    // Assuming 8 teams max, but could dynamically count
    const totalTeams = 8; 

    const subs = Object.entries(st.submissions).map(([teamId, sub]) => ({
      teamId: parseInt(teamId),
      submitTime: sub.submitTime
    })).sort((a, b) => a.submitTime - b.submitTime);
    
    let rankMap = {};
    subs.forEach((s, idx) => {
      if (idx < 3) rankMap[s.teamId] = idx + 1;
    });

    let teamCardsHtml = '';
    for(let i=1; i<=8; i++) {
      const isSub = !!st.submissions[i];
      let badgeHtml = `<span class="status-badge status-waiting">대기중...</span>`;
      if (isSub) {
         if (rankMap[i]) {
            badgeHtml = `<span class="status-badge status-submitted" style="background-color: #ff9800;">${rankMap[i]}등! 🚀</span>`;
         } else {
            badgeHtml = `<span class="status-badge status-submitted">✅ 제출완료</span>`;
         }
      }

      teamCardsHtml += `
        <div class="team-status-card">
          <h2>${i}모둠</h2>
          ${badgeHtml}
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="glass-panel">
        <h2 style="color: var(--primary)">진행중: ${qData.title}</h2>
        <div style="margin: 2rem 0; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-size: 1.5rem">제출 현황 (${submittedCount}/${totalTeams})</h3>
          <button class="btn btn-success" onclick="window.TeacherApp.publishResults()">결과 발표 💯</button>
        </div>
        <div class="teacher-grid">
          ${teamCardsHtml}
        </div>
      </div>
    `;
  },

  startGame() {
    window.STORE.update(state => {
      state.status = 'question';
      state.currentQuestionIndex = 0;
      state.startTime = Date.now();
      state.submissions = {};
    });
  },

  publishResults() {
    window.STORE.update(state => {
      const qData = window.GAME_DATA.QUESTIONS[state.currentQuestionIndex];
      let correctAnswers = [];
      qData.sentences.forEach(s => correctAnswers.push(...s.blanks));
      const totalBlanks = correctAnswers.length;

      // Sort submissions by time to find speed ranks
      const subs = Object.entries(state.submissions).map(([teamId, sub]) => ({
        teamId: parseInt(teamId),
        submitTime: sub.submitTime,
        answers: sub.answers
      })).sort((a, b) => a.submitTime - b.submitTime);

      subs.forEach((sub, index) => {
        // Speed rank only applies to the top 3
        let speedRank = index + 1;
        let speedBonus = 0;
        if (speedRank === 1) speedBonus = 1.5;
        else if (speedRank === 2) speedBonus = 1.0;
        else if (speedRank === 3) speedBonus = 0.5;

        // Calculate corrects
        let correctCount = 0;
        sub.answers.forEach((ans, idx) => {
          if (ans === correctAnswers[idx]) correctCount++;
        });

        // All correct bonus
        let allCorrectBonus = (correctCount === totalBlanks) ? 1.0 : 0;

        // Update score
        const earned = correctCount + speedBonus + allCorrectBonus;
        state.teamScores[sub.teamId] += earned;
        
        // Save result metadata back into submissions so students can see their rank
        state.submissions[sub.teamId].speedRank = (speedRank <= 3) ? speedRank : '-';
        state.submissions[sub.teamId].score = earned;
      });

      state.status = 'score_popup';
    });
  },

  renderScorePopupDash() {
    this.container.innerHTML = `
      <div class="glass-panel" style="text-align: center">
        <h1 class="title">점수계산서 발표 중</h1>
        <p style="font-size: 1.2rem; margin-bottom: 2rem;">학생들 화면에 점수 계산서가 표시되고 있습니다.<br>확인할 시간을 준 뒤, 순위 확인을 눌러주세요.</p>
        <button class="btn btn-primary" style="font-size: 1.5rem" onclick="window.TeacherApp.showChart()">순위 확인 📊</button>
      </div>
    `;
  },

  showChart() {
    window.STORE.update(state => {
      state.status = 'chart_view';
    });
  },

  renderChartDash() {
    const st = this.currentState;
    const isLastItem = st.currentQuestionIndex >= window.GAME_DATA.QUESTIONS.length - 1;

    this.container.innerHTML = `
      <div class="glass-panel" style="text-align: center">
        <h1 class="title">순위 그래프 발표 중</h1>
        <p style="font-size: 1.2rem; margin-bottom: 2rem;">학생들 화면에 순위 그래프 애니메이션이 표시되고 있습니다.</p>
        
        ${isLastItem 
          ? `<button class="btn btn-success" style="font-size: 1.5rem" onclick="window.TeacherApp.showFinalRanking()">최종 순위 발표 🏆</button>`
          : `<button class="btn" style="font-size: 1.5rem" onclick="window.TeacherApp.prepareNextQuestion()">다음 문제로 넘어가기 ➡️</button>`
        }
      </div>
    `;
  },

  prepareNextQuestion() {
    window.STORE.update(state => {
      state.currentQuestionIndex++;
      state.status = 'waiting_next';
      state.submissions = {};
    });
  },

  startPreparedQuestion() {
    window.STORE.update(state => {
      state.status = 'question';
      state.startTime = Date.now();
    });
  },

  showFinalRanking() {
    window.STORE.update(state => {
      state.status = 'final_ranking';
    });
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
  }
};
