// User service UUID: Change this to your generated service UUID
const USER_SERVICE_UUID         = '1EF03D0A-4571-4E46-A065-962D3C39D707'; // LED, Button
// User service characteristics
const LED_CHARACTERISTIC_UUID   = 'E9062E71-9E62-4BC6-B0D3-35CDCD9B027B';
const NOTIFY_UUID   = '62FBD229-6EDD-4D1A-B554-5C4E1BB29169';

// PSDI Service UUID: Fixed value for Developer Trial
const PSDI_SERVICE_UUID         = 'E625601E-9E55-4597-A598-76018A0D293D'; // Device ID
const PSDI_CHARACTERISTIC_UUID  = '26E2B12B-85F0-4F3F-9FDD-91D114270E6E';

const startBtn = document.getElementById('startBtn')
const disconnectBtn = document.getElementById('disconnect')
const debugElm = document.getElementById('debug')

//距離の閾値
let distance = 215;
const distanceThreshold = {
  min: 30,
  max: 400
};

// -------------- //
// On window load //
// -------------- //

window.onload = () => {
  initializeApp();
};
// -------------- //
// LIFF functions //
// -------------- //

function initializeApp() {
    liff.init(() => initializeLiff(), error => debug(error));
}

function initializeLiff() {
    liff.initPlugins(['bluetooth']).then(() => {
      liffCheckAvailablityAndDo(() => liffRequestDevice());
    }).catch(error => {
      debug(error)
    });
}

function liffCheckAvailablityAndDo(callbackIfAvailable) {
    // Check Bluetooth availability
    liff.bluetooth.getAvailability().then(isAvailable => {
        if (isAvailable) {
            callbackIfAvailable();
        } else {
            debug("Bluetooth not available")
            setTimeout(() => liffCheckAvailablityAndDo(callbackIfAvailable), 10000);
        }
    }).catch(error => {
      debug(error)
    });
}

function liffRequestDevice() {
    liff.bluetooth.requestDevice().then(device => {
        liffConnectToDevice(device);
    }).catch(error => {
        debug(error)
    });
}

function liffConnectToDevice(device) {
    device.gatt.connect().then(() => {

        // Get service
        device.gatt.getPrimaryService(USER_SERVICE_UUID).then(service => {
            liffGetUserService(service);
        }).catch(error => {
            debug(error)
        });
        device.gatt.getPrimaryService(PSDI_SERVICE_UUID).then(service => {
            liffGetPSDIService(service);
        }).catch(error => {
            debug(error)
        });

        // Device disconnect callback
        const disconnectCallback = () => {
            // Remove disconnect callback
            device.removeEventListener('gattserverdisconnected', disconnectCallback);
            // Try to reconnect
            initializeLiff();
        };
        device.addEventListener('gattserverdisconnected', disconnectCallback);
    }).catch(error => {
      debug(error)
    });
}

function liffGetUserService(service) {
    service.getCharacteristic(NOTIFY_UUID).then(characteristic => {
        liffGetNotifyCharacteristic(characteristic);
    }).catch(error => {
        debug(error)
    });

    // calc btn toggle
    service.getCharacteristic(LED_CHARACTERISTIC_UUID).then(characteristic => {
        window.ledCharacteristic = characteristic;

        // Switch off by default
        liffToggleDeviceState(false);
    }).catch(error => {
        debug(error)
    });
}

function liffGetPSDIService(service) {
    // Get PSDI value
    service.getCharacteristic(PSDI_CHARACTERISTIC_UUID).then(characteristic => {
        return characteristic.readValue();
    }).then(value => {
        // Byte array to hex string
        const psdi = new Uint8Array(value.buffer)
            .reduce((output, byte) => output + ("0" + byte.toString(16)).slice(-2), "");
    }).catch(error => {
        debug(error)
    });
}

function liffGetNotifyCharacteristic(characteristic) {
  characteristic.startNotifications().then(() => {
    characteristic.addEventListener('characteristicvaluechanged', e => {
      const buff = new Uint8Array(e.target.value.buffer);
      const val = Number((new TextDecoder).decode(buff));
      //notifyでglobalのdistanceを設定
      distance = val
    });
  }).catch(error => {
    debug(error)
  });
}

function liffToggleDeviceState(state) {
  // on: 0x01
  // off: 0x00
  window.ledCharacteristic.writeValue(
      state ? new Uint8Array([0x01]) : new Uint8Array([0x00])
  ).catch(error => {
      debug(error)
  });
}


function liffSendServoSignal() {
  window.ledCharacteristic.writeValue(new Uint8Array([0x02])).catch(error => {
      debug(error)
  });
}

function debug(obj) {
  if (typeof obj === 'string') {
    debugElm.textContent = obj
  }
  debugElm.textContent = obj.toString()
}


let myGameArea;
let myGamePiece;
let myBeers = [];
let myUnko = [];
let myscore;
let interval;
let gameAudio;
let isStarted = false
const gameImgs = {
  ufo: null,
  beer: null,
  unko: null
}
const canvasContainer = document.getElementById('canvascontainer')
const filter = document.getElementById('myfilter')
const obstacleGap = {
  min: 50, //UFOの高さ　+ 10
  max: null
}
const obstacleHeight = {
  min: 20, //任意
  max: null
}
let liffShake;


function loadImages() {
  const keys = Object.keys(gameImgs)
  const imgLoadWaits = keys.map(img => {
    gameImgs[img] = new Image()
    gameImgs[img].src = `./${img}.png`
    return new Promise(resolve => {
      gameImgs[img].onload = () => {
        resolve()
      }
    })
  })
  return Promise.all(imgLoadWaits)
}

function restartGame() {
  if (liffShake) {
    liffShake.stop()
  }
  myGameArea.stop();
  myGameArea.clear();
  myGameArea.canvas.parentNode.removeChild(myGameArea.canvas)
  myGameArea = {};
  myGamePiece = {};
  myObstacles = [];
  myBeers = [];
  myUnko = [];
  myscore = {};
  startGame()
}

function startGame() {
  filter.style.display = 'none'
  startBtn.style.display = 'none'
  myGameArea = new GameArea()
  myGamePiece = new Component(73, 30, null, 10, myGameArea.canvas.height / 2 - 15, 'img', 'ufo')
  myscore = new Component('15px', 'Consolas', '#fff', 220, 25, 'text')
  
  obstacleGap.max = Math.floor(myGameArea.canvas.height * 0.6)
  obstacleHeight.max = Math.floor(myGameArea.canvas.height - obstacleGap.max)

  gameAudio = new LiffAudio()
  myGameArea.start()
}

class GameArea{
  constructor() {
    this.container = canvasContainer
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;    
    this.container.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d');
    this.pause = false;
    this.frameNo = 0;
  }

  start() {
    interval = requestAnimationFrame(updateGameArea);
  }

  stop() {
    cancelAnimationFrame(interval)
    gameAudio.stop()
    this.pause = true;
  }

  clear(){
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

}

class Component{
  constructor(width, height, color, x, y, type, imgType) {
    this.type = type;
    if (type === 'text') {
      this.text = color;
    }
    if (type === 'img') {
      this.imgType = imgType
    }
    this.color = color;
    this.score = 0;
    this.width = width;
    this.height = height;
    this.speedX = 0;
    this.speedY = 0;
    this.x = x;
    this.y = y;
  }

  update() {
    const ctx = myGameArea.context;
    if (this.type == 'text') {
      ctx.font = this.width + ' ' + this.height;
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
    } else if (this.type == 'img'){
      myGameArea.context.drawImage(gameImgs[this.imgType], this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }

  crashWith(otherobj) {
    const myleft = this.x
    const myright = this.x + (this.width)
    const mytop = this.y
    const mybottom = this.y + (this.height)
    const otherleft = otherobj.x
    const otherright = otherobj.x + (otherobj.width)
    const othertop = otherobj.y
    const otherbottom = otherobj.y + (otherobj.height)
    let crash = true
    if ((mybottom < othertop) || (mytop > otherbottom) || (myright < otherleft) || (myleft > otherright)) {
      crash = false
    }
    return crash
  }
}

let beerCount = 0

function updateGameArea() {
  
  //うんこへの衝突判定
  for (let i = 0; i < myUnko.length; i++) {
    if (myGamePiece.crashWith(myUnko[i])) {
      effectSounds.play('crash')
      myGameArea.stop();
      liffToggleDeviceState(false)
      filter.style.display = 'block';
      startBtn.style.display = 'block';
      if (liffShake) {
        liffShake.start()
      }
      return;
    }
  }

  //ビールへの衝突判定
  for (let i = 0; i < myBeers.length; i++) {
    if (myGamePiece.crashWith(myBeers[i])) {
      myBeers.splice(i, 1)
      effectSounds.play('beer')
      debug(String(++beerCount))
      liffSendServoSignal()
    }
  }

  if (myGameArea.pause === true) return

  const goalPos = getGoalPos(distance)
  myGameArea.clear();
  myGameArea.frameNo += 1;
  myscore.score +=1;

  if (goalPos !== myGamePiece.y) {
    move(goalPos)
  } else {
    clearmove()
  }

  gameAudio.play(distance)

  //障害物の追加
  if (myGameArea.frameNo == 1 || everyinterval(280)) {

    const x = myGameArea.canvas.width
    const y = getRandom(0, myGameArea.canvas.height)

    //ビール
    myBeers.push(new Component(45, 51, null, x, y, 'img', 'beer'))
  }

  if (myGameArea.frameNo == 1 || everyinterval(80)) {
    const x = myGameArea.canvas.width
    const y = getRandom(0, myGameArea.canvas.height)
    myUnko.push(new Component(51, 52, null, x, y, 'img', 'unko'))
  }

  //ビールが迫ってくる動き
  for (let i = 0; i < myBeers.length; i++) {
    if (myBeers[i].remove) continue
    myBeers[i].x += -3
    myBeers[i].update()
  }

  //うんこが迫ってくる動き
  for (let i = 0; i < myUnko.length; i++) {
    myUnko[i].x += -4
    myUnko[i].update()
  }

  myscore.text='SCORE: ' + myscore.score;        
  myscore.update();
  // myGamePiece.x += myGamePiece.speedX;
  myGamePiece.y += myGamePiece.speedY;  
  myGamePiece.update();
  interval = requestAnimationFrame(updateGameArea);
}

function getGoalPos(distance) {
  //距離の閾値30 ~ 400
  const canvasHeight = myGameArea.canvas.height
  const min = distanceThreshold.min
  const max = distanceThreshold.max
  if (!distance || distance > max) return 0
  if (distance < min) return canvasHeight
  return Math.floor(canvasHeight - ((distance - min) * (canvasHeight / (max - min))))
}

function move(goalPos) {
  if (goalPos - myGamePiece.y > 0) {
    moveDown()
  } else {
    moveUp()
  }
}

function everyinterval(n) {
  if ((myGameArea.frameNo / n) % 1 == 0) {return true;}
  return false;
}

function moveUp() {
  myGamePiece.speedY = -1.5
}

function moveDown() {
  myGamePiece.speedY = 1.5
}

function clearmove() {
  myGamePiece.speedX = 0; 
  myGamePiece.speedY = 0; 
}

function getRandom(min, max) {
  return Math.floor(Math.random() * (max - min) + min)
}

window.AudioContext = window.AudioContext || window.webkitAudioContext;

class LiffAudio{
  constructor(hlzElm) {
    this.hlzElm = hlzElm
    const tremolo = new Tone.Tremolo(30, 0.75).toMaster().start()
    const vibrato = new Tone.Vibrato(5, 0.5).toMaster()
    this.hlz = this.convert(distance)
    this.oscillator = new Tone.Oscillator(this.hlz).connect(vibrato).connect(tremolo)
    this.oscillator.start()
  }
  convert(distance) {
    //距離閾値 30 ~ 400
    //hz閾値　100 ~ 1000
    //1mm = 3hz
    if (distance > 400) return 1000
    if (distance < 30) return 100
    return 100 + ((distance - 30) * 3);
  }
  play(distance, dist) {
    if (this.hlzElm) this.hlzElm.innerText = hlz
    const hlz = this.convert(distance)
    if (hlz !== this.hlz) {
      this.changeHlz(hlz)
    }
    this.oscillator.frequency.value = this.hlz
  }
  changeHlz(hlz) {
    if (hlz - this.hlz > 0) {
      this.speed = 3
    } else {
      this.speed = -3
    }
    this.hlz += this.speed
  }
  stop() {
    this.oscillator.stop()
  }
  getHlz() {
    return this.hlz
  }
}

class EffectSounds{
  constructor(sounds) {
    this.sounds = sounds
  }
  load() {
    this.player = {}
    const keys = Object.keys(this.sounds)
    const waitSoundLoad = keys.map(key => {
      return new Promise(resolve => {
        this.player[key] = new Tone.Player(this.sounds[key], () => {
          resolve()
        }).toMaster()
      })
    })
    return Promise.all(waitSoundLoad)
  }
  play(key) {
    this.player[key].start()
  }
  stop(key) {
    this.player[key].stop()
  }
}

class LiffShake{
  constructor(listener, threshold, timeout) {
    this.shake = new Shake({
      threshold: threshold ? threshold : 5, // optional shake strength threshold
      timeout: timeout ? timeout : 500 // optional, determines the frequency of event generation
    })
    this.listenerAdded = false
    this.listener = listener
  }

  start() {
    this.shake.start()
    if (!this.listenerAdded) {
      window.addEventListener('shake', this.listener, false)
      this.listenerAdded = true
    }
  }

  stop() {
    this.shake.stop()
  }
}
let shakeCount = 0;
let effectSounds;
startBtn.addEventListener('click', async e => {
  if (!isStarted) {
    liffToggleDeviceState(true)
    isStarted = true
    effectSounds = new EffectSounds({crash: './crash.mp3', beer: './beer.mp3'})
    await effectSounds.load()
    await loadImages()
    startGame()
    startBtn.textContent = 'RESTART'
    liffShake = new LiffShake(() => {
      debug(`shaked!! ${++shakeCount}`)
      liffToggleDeviceState(true)
      restartGame()
    })
    return
  }
  liffToggleDeviceState(true)
  restartGame()
})

disconnectBtn.addEventListener('click', e => {
  liffToggleDeviceState(false)
})