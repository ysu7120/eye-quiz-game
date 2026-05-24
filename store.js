// A generated unique room ID to prevent overlaps. 
// If the teacher wants to run multiple classes, they can change this ID.
const ROOM_ID = "ysu7120_eye_quiz_2026";
const TOPIC = `quiz-game/${ROOM_ID}/state`;

function getDefaultState() {
  return {
    status: "lobby", // lobby, question, grading, final_ranking
    currentQuestionIndex: 0,
    teamScores: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
    submissions: {},
    connectedTeams: [],
    startTime: null
  };
}

const Store = {
  client: null,
  localState: getDefaultState(),
  listeners: [],
  isTeacher: false,

  init(isTeacher) {
    this.isTeacher = isTeacher;
    // Fallback local storage state
    try {
      const data = localStorage.getItem("QUIZ_GAME_" + ROOM_ID);
      if (data) this.localState = JSON.parse(data);
    } catch(e) {}

    // Connect to public MQTT WebSocket broker
    this.client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: 'quiz_' + Math.random().toString(16).substr(2, 8)
    });

    this.client.on('connect', () => {
      console.log('Connected to MQTT Broker!');
      this.client.subscribe(TOPIC, (err) => {
        if (!err && this.isTeacher) {
          // Teacher pushes current state on connect
          this.publish();
        }
      });

      // If student, publish a request for state (empty message or 'SYNC')
      if (!this.isTeacher) {
        this.client.publish(TOPIC + '/sync', 'request_sync');
      }
    });

    // If teacher, listen for sync requests
    if (this.isTeacher) {
      this.client.subscribe(TOPIC + '/sync');
      this.client.subscribe(TOPIC + '/join');
    }

    this.client.on('message', (topic, message) => {
      if (topic === TOPIC) {
        try {
          const parsed = JSON.parse(message.toString());
          this.localState = parsed;
          this.saveLocal();
          this.notifyListeners();
        } catch(e) { console.error(e); }
      } else if (topic === TOPIC + '/sync' && this.isTeacher) {
        // A student joined, send current state
        this.publish();
      } else if (topic === TOPIC + '/join' && this.isTeacher) {
        const teamId = parseInt(message.toString());
        if (!this.localState.connectedTeams) {
          this.localState.connectedTeams = [];
        }
        if (!this.localState.connectedTeams.includes(teamId)) {
           this.localState.connectedTeams.push(teamId);
           this.saveLocal();
           this.publish();
           this.notifyListeners();
        }
      }
    });
  },

  joinTeam(teamId) {
    if (this.client && !this.isTeacher) {
      this.client.publish(TOPIC + '/join', teamId.toString());
    }
  },

  get() {
    return this.localState;
  },
  
  saveLocal() {
    localStorage.setItem("QUIZ_GAME_" + ROOM_ID, JSON.stringify(this.localState));
  },

  publish() {
    if (this.client && this.client.connected) {
      this.client.publish(TOPIC, JSON.stringify(this.localState), { retain: true });
    }
  },

  reset() {
    this.localState = getDefaultState();
    this.saveLocal();
    this.publish();
    this.notifyListeners();
  },

  update(mutation) {
    mutation(this.localState);
    this.saveLocal();
    this.publish();
    this.notifyListeners();
  },

  listen(callback) {
    this.listeners.push(callback);
  },

  notifyListeners() {
    this.listeners.forEach(cb => cb(this.localState));
  }
};

window.STORE = Store;
