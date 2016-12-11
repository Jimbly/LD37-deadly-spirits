/*jshint browser:true*/

/*global $: false */
/*global TurbulenzEngine: true */
/*global Draw2D: false */
/*global Draw2DSprite: false */
/*global RequestHandler: false */
/*global TextureManager: false */
/*global Camera: false */

TurbulenzEngine.onload = function onloadFn()
{
  const TEST = false;

  const DIG_TIME = TEST ? 1000 : 8000;
  const DIG_TIME_TUTORIAL = 6000;
  const REPAIR_TIME = 8000/16;
  const BOARD_MAX_HP = 12;
  const WORKER_MAX_HP = TEST ? 200 : 20;
  const SPEED_WORKER = TEST ? 4/1000 : 4/1000;
  const SPEED_ORB_EVIL = 1/1000;
  const SPEED_ORB_TUTORIAL = 4/1000;
  const SPEED_ORB_GOOD = 1/1000;
  const TARGET_WORKERS = TEST ? 0 : 4;
  const TARGET_WORKER_RANGE = TEST ? [3,6] : [8, 12];
  const EVIL_RATE = 3000;
  const GOOD_RATE = 3000;
  const TUTORIAL_RATE = 1200;
  const EXIT_DIST = TEST ? 2 : 8;
  const ROOM_OPEN_DELAY = 150;
  const RED_FADE_IN_TIME = 1500;
  const NEW_WORKER_CHAT_MIN = 5000;
  const NEW_WORKER_CHAT_MAX = 25000;


  const Z_BOARD  = 0;
  const Z_HP = 1;
  const Z_TASK_PROGRESS = 2;
  const Z_WORKER = 3;
  const Z_HP_INACTIVE = Z_HP;
  const Z_WORKER_DAMAGE = 5;
  const Z_ORB = 5;
  const Z_HIGHLIGHT = 100;

  const dx = [-1, 1, 0, 0];
  const dy = [0, 0, -1, 1];
  const dx_suffix = ['L', 'R', 'U', 'D'];
  const hp_pos_x = [2, 3, 3.3, 3.3, 3, 2, 1, 0, -0.3, -0.3, 0, 1];
  const hp_pos_y = [-0.3, 0, 1, 2, 3, 3.3, 3.3, 3, 2, 1, 0, -0.3];
  let intervalID;
  const graphicsDevice = TurbulenzEngine.createGraphicsDevice({});
  const mathDevice = TurbulenzEngine.createMathDevice({});
  const draw2D = Draw2D.create({ graphicsDevice });
  const requestHandler = RequestHandler.create({});
  const textureManager = TextureManager.create(graphicsDevice, requestHandler);
  const inputDevice = TurbulenzEngine.createInputDevice({});
  const input = require('./input.js').create(inputDevice, draw2D);
  const draw_list = require('./draw_list.js').create(draw2D);
  const random_seed = require('random-seed');
  let rand = random_seed.create('seed1');

  function randFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  let soundDeviceParameters = {
    linearDistance : false
  };
  const soundDevice = TurbulenzEngine.createSoundDevice(soundDeviceParameters);
  const camera = Camera.create(mathDevice);
  const lookAtPosition = mathDevice.v3Build(0.0, 0.0, 0.0);
  const worldUp = mathDevice.v3BuildYAxis();
  const cameraPosition = mathDevice.v3Build(0.0, 0.0, 1.0);
  camera.lookAt(lookAtPosition, worldUp, cameraPosition);
  camera.updateViewMatrix();
  soundDevice.listenerTransform = camera.matrix;
  // const sound_source_mid = soundDevice.createSource({
  //   position : mathDevice.v3Build(0, 0, 0),
  //   relative : false,
  //   pitch : 1.0,
  // });
  let global_timer = 0;

  function toNumber(v) {
    return Number(v);
  }
  function sign(x) {
    return x < 0 ? -1:
      x > 0 ? 1 : 0;
  }
  function arrayRemove(arr, idx) {
    arr[idx] = arr[arr.length - 1];
    arr.pop();
  }

  let sounds = {};
  function loadSound(base) {
    let src = 'sounds/' + base;
    // if (soundDevice.isSupported('FILEFORMAT_WAV')) {
    src += '.wav';
    // } else {
    //   src += '.ogg';
    // }
    soundDevice.createSound({
      src: src,
      onload: function (sound) {
        if (sound) {
          sounds[base] = sound;
        }
      }
    });
  }
  loadSound('test');
  // function playSound(source, soundname) {
  //   if (!sounds[soundname]) {
  //     return;
  //   }
  //   source._last_played = source._last_played || {};
  //   let last_played_time = source._last_played[soundname] || -9e9;
  //   if (global_timer - last_played_time < 45) {
  //     return;
  //   }
  //   source.play(sounds[soundname]);
  //   source._last_played[soundname] = global_timer;
  // }

  let textures = {};
  function loadTexture(texname) {
    let path = texname;
    if (texname.indexOf('.') !== -1) {
      path = 'img/'+ texname;
    }
    const inst = textureManager.getInstance(path);
    if (inst) {
      return inst;
    }
    textures[texname] = textureManager.load(path, false);
    return textureManager.getInstance(path);
  }
  function createSprite(texname, params) {
    const tex_inst = loadTexture(texname);
    params.texture = tex_inst.getTexture();
    const sprite = Draw2DSprite.create(params);
    tex_inst.subscribeTextureChanged(function () {
      sprite.setTexture(tex_inst.getTexture());
    });
    return sprite;
  }

  // Preload
  loadTexture('test.png');

  // Viewport for Draw2D.
  let game_width = 1216;
  let game_height = 1216;
  const color_white = mathDevice.v4Build(1, 1, 1, 1);
  const color_green = mathDevice.v4Build(0, 1, 0, 1);
  const color_red = mathDevice.v4Build(1, 0, 0, 1);
  const color_hp_inactive = mathDevice.v4Build(0.5, 0, 0, 0.5);
  const color_yellow = mathDevice.v4Build(1, 1, 0, 1);
  const color_new_worker = mathDevice.v4Build(1, 1, 1, 0.25);

  const board_tile_size = 64;
  const hp_tile_size = board_tile_size / 6;
  const hp_tile_pad = hp_tile_size;
  const orb_tile_size = 16;
  const worker_scale = 0.67;

  function htmlPos(x, y) {
    const ymin = 0;
    const ymax = game_height;
    const xmin = 0;
    const xmax = game_width;
    return [100 * (x - xmin) / (xmax - xmin), 100 * (y - ymin) / (ymax - ymin)];
  }

  function notify(x, y, msg) {
    let pos = htmlPos(x, y);
    let child = $('<div class="floater" style="left: ' + pos[0] + '%; top: ' + pos[1] + '%;">' + msg + '</div>');
    $('#dynamic_text').append(child);
    setTimeout(function () {
      child.addClass('fade');
    }, 1);
    setTimeout(function () {
      child.remove();
    }, 5000);
  }


  // Cache keyCodes
  // const keyCodes = inputDevice.keyCodes;
  // const padCodes = input.padCodes;

  let game_state;

  let graphics = {};

  function initGraphics() {
    const sprite_size = 64;
    let color_sprite = color_white;
    function loadSprite(name, texres, size_override, origin_override) {
      graphics[name] = createSprite(name + '.png', {
        width : size_override || sprite_size,
        height : size_override || sprite_size,
        x : 0,
        y : 0,
        origin: origin_override || [0,0],
        rotation : 0,
        color : color_sprite,
        textureRectangle : mathDevice.v4Build(0, 0, texres, texres)
      });
    }
    loadSprite('board', 256);
    loadSprite('highlight', 256);
    loadSprite('highlight_L', 256);
    loadSprite('highlight_R', 256);
    loadSprite('highlight_U', 256);
    loadSprite('highlight_D', 256);
    loadSprite('worker', 128);
    loadSprite('worker_damage', 128);
    loadSprite('dig_progress', 128);
    loadSprite('hp_progress', 128);
    loadSprite('red', 128);
    loadSprite('exit', 128);
    loadSprite('orb', 128, orb_tile_size, [-24, -24]);
    loadSprite('hp', 32, hp_tile_size);
    loadSprite('hp_center', 128, 40, [20, 20]);
  }

  class BoardEntry {
    constructor() {
      this.state = null;
      this.hp = 0;
      this.orb_countdown = 0;
      this.orb_out = false;
      this.task_counter = 0;
      this.show_at = 0;
      this.notify_countdown = 0;
    }
  }

  class Worker {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.assigned_at = 0;
      this.task = '';
      this.hp = WORKER_MAX_HP;
    }
  }

  let board_instance = 0;
  class Board {
    constructor(is_tutorial) {
      this.open_count = 0;
      this.map = [];
      this.workers = [];
      this.mobiles = [];
      this.orbs = [];
      this.num_escaped = 0;
      this.selected_worker = null;
      if (is_tutorial) {
        this.generateTutorial();
      } else {
        ++board_instance;
        if (board_instance === 1) {
          rand = random_seed.create('seed1');
        }
        this.generateInit();
      }
    }

    generateTutorial() {
      let tut = this.tutorial = {
        counter: 0,
        counter_limit: 8000,
        s1: {
          x: -3,
          y: -5,
        },
        s2: {
          x: -5,
          y: 0,
        },
        s3: {
          x: 2,
          y: 0,
        }
      };
      for (let ii = 0; ii < 3; ++ii) {
        for (let jj = 0; jj < 3; ++jj) {
          this.mapSet(tut.s1.x + ii, tut.s1.y + jj, 'green', 0);
        }
      }
      this.workers.push(new Worker(tut.s1.x + 1, tut.s1.y + 1));
      let worker = tut.s1.worker = new Worker(tut.s1.x + 3, tut.s1.y + 1);
      worker.last_safe_x = tut.s1.x + 3 - 0.5;
      worker.last_safe_y = tut.s1.y + 1;
      worker.task = 'dig';
      this.workers.push(worker);

      for (let ii = 0; ii < 4; ++ii) {
        for (let jj = 0; jj < 4; ++jj) {
          this.mapSet(tut.s2.x + ii, tut.s2.y + jj, ii === 0 ? 'red' : 'green', 0);
          this.mapSet(tut.s3.x + ii, tut.s2.y + jj, 'green', (ii === 0) ? BOARD_MAX_HP : 0);
        }
      }
      worker = tut.s3.worker = new Worker(tut.s3.x + 3, tut.s3.y + 2);
      worker.task = 'disabled';
      this.workers.push(worker);

      this.resetTutorial();
    }

    resetTutorial() {
      rand = random_seed.create('tutorial1');
      let tut = this.tutorial;
      tut.counter = 0;

      let be = this.map[tut.s1.x + 1][tut.s1.y + 1];
      be.hp = 0;
      be.orb_countdown = 1000000;

      be = this.map[tut.s1.x + 2][tut.s1.y + 1];
      be.hp = 0;
      be.orb_countdown = 1000000;

      for (let ii = tut.s1.x + 3; ii < tut.s1.x + 7; ++ii) {
        for (let jj = tut.s1.y - 2; jj < tut.s1.y + 4; ++jj) {
          if (this.map[ii] && this.map[ii][jj]) {
            delete this.map[ii][jj];
          }
        }
      }
      let worker = tut.s1.worker;
      worker.x = tut.s1.x + 3;
      worker.y = tut.s1.y + 1;
      worker.last_safe_x = tut.s1.x + 3 - 0.5;
      worker.last_safe_y = tut.s1.y + 1;
      worker.task = 'dig';
      this.mapSet(tut.s1.x + 3, tut.s1.y + 1, 'red', 0);
      this.map[tut.s1.x + 3][tut.s1.y + 1].orb_countdown = 1000000;

      worker = new Worker(tut.s2.x + 3, tut.s2.y + 2);
      worker.task = 'disabled';
      worker.hp = 10;
      this.workers.push(worker);
      be = this.map[tut.s2.x + 3][tut.s2.y + 1];
      be.hp = BOARD_MAX_HP;
      be.orb_countdown = 1000000;


      tut.s3.worker.hp = 2;
      be = this.map[tut.s3.x + 3][tut.s3.y + 1];
      be.hp = 1;
      //be.orb_countdown = 1000000;

      for (let ii = this.orbs.length - 1; ii >= 0; --ii) {
        this.removeOrb(this.orbs[ii], ii);
      }
    }

    updateTutorial(dt) {
      this.tutorial.counter += dt;
      if (this.tutorial.counter > this.tutorial.counter_limit) {
        this.resetTutorial();
      }
    }

    generateInit() {
      let init_workers = 2;

      let gen_range = TEST ? 2 : 1;
      for (let ii = -gen_range; ii <= gen_range; ++ii) {
        for (let jj = -gen_range; jj <= gen_range; ++jj) {
          this.mapSet(ii, jj, 'green', (jj !== 1) ? BOARD_MAX_HP : 0);
          if (init_workers) {
            --init_workers;
            this.workers.push(new Worker(ii, jj));
          }
        }
      }
      for (let ii = -(gen_range + 1); ii <= (gen_range + 1); ++ii) {
        for (let jj = -(gen_range + 1); jj <= (gen_range + 1); ++jj) {
          if (this.mapIsNeighbor(ii, jj)) {
            this.mapSet(ii, jj, 'red');
          }
        }
      }

      for (let ii = 0; ii < TARGET_WORKERS; ++ii) {
        do {
          let angle = rand.floatBetween(0, 2 * Math.PI);
          let x = Math.cos(angle);
          let y = Math.sin(angle);
          let dist = rand.floatBetween(TARGET_WORKER_RANGE[0], TARGET_WORKER_RANGE[1]);
          x = Math.round(x * dist);
          y = Math.round(y * dist);
          if (!this.mapGet(x, y, 'state')) {
            this.mapSet(x, y, 'new_worker');
            break;
          }
        } while (true);
      }

      this.checkGenerateExit();
    }

    mapGet(x, y, field) {
      let be = this.map[x] && this.map[x][y];
      if (field) {
        return be && be[field];
      } else {
        return be;
      }
    }

    mapIsNeighbor(x, y) {
      let state = this.mapGet(x, y, 'state');
      if (state && state !== 'red' && state !== 'new_worker' && state !== 'exit') {
        return false;
      }
      let ret = [];
      for (let ii = 0; ii < dx.length; ++ii) {
        state = this.mapGet(x + dx[ii], y + dy[ii], 'state');
        if (state === 'green') {
          ret.push(dx_suffix[ii]);
        }
      }
      return ret.length ? ret : false;
    }

    mapSet(x, y, state, hp) {
      this.map[x] = this.map[x] || [];
      this.map[x][y] = this.map[x][y] || new BoardEntry();
      if (this.map[x][y].state !== state) {
        if (this.map[x][y].state === 'red' || !this.map[x][y].state && state !== 'red') {
          this.open_count++;
        }
        this.map[x][y].orb_out = false;
        let rate = null;
        if (this.tutorial) {
          rate = TUTORIAL_RATE;
        } else if (hp) {
          rate = GOOD_RATE;
        } else if (state === 'red') {
          rate = EVIL_RATE;
        }
        if (rate) {
          this.map[x][y].orb_countdown = (Math.random() * 0.25 + 0.25) * rate;
        }
      }
      this.map[x][y].state = state;
      this.map[x][y].hp = hp;
    }

    generateRoom(x, y, force_size) {
      const sizes = [3, 10, 20];
      let size = 2 + Math.floor(this.open_count / 20) + rand(sizes[rand(sizes.length)]);
      if (this.tutorial) {
        size = 5;
      }
      if (force_size) {
        size = force_size;
      }
      let neighbors = [];
      let board = this;
      let counter = 0;
      function clear(x, y) {
        let existing_state = board.mapGet(x, y, 'state');
        if (existing_state && existing_state !== 'red') {
          return;
        }
        --size;
        let show_at = global_timer + (counter * ROOM_OPEN_DELAY);
        ++counter;
        board.mapSet(x, y, 'green', 0);
        board.map[x][y].task_counter = 0;
        board.map[x][y].show_at = show_at;
        for (let ii = 0; ii < dx.length; ++ii) {
          neighbors.push([x + dx[ii], y + dy[ii]]);
          if (!board.mapGet(x + dx[ii], y + dy[ii], 'state')) {
            board.mapSet(x + dx[ii], y + dy[ii], 'red');
            if (board.tutorial) {
              board.map[x + dx[ii]][y + dy[ii]].orb_countdown = 1000000;
            }
            board.map[x + dx[ii]][y + dy[ii]].show_at = show_at;
          }
        }
      }
      clear(x, y);
      while (size && neighbors.length) {
        let next = neighbors.splice(rand(neighbors.length), 1);
        clear(next[0][0], next[0][1]);
      }
    }

    // Nearest 'green' square without a worker
    findNearestEmpty(x, y) {
      let worker_at = [];
      this.workers.forEach(function (worker) {
        let x = worker.x;
        let y = worker.y;
        if (worker.moving) {
          x = worker.dest_x;
          y = worker.dest_y;
        }
        worker_at[x] = worker_at[x] || [];
        worker_at[x][y] = true;
      });
      let board = this;
      function test(x, y, only_hp) {
        if (board.mapGet(x, y, 'state') !== 'green') {
          return;
        }
        if (only_hp && !board.mapGet(x, y, 'hp')) {
          return;
        }
        if (!worker_at[x] || !worker_at[x][y]) {
          return [x, y];
        }
      }
      let d = 1;
      while (true) {
        let r;
        let vvs = [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ];
        for (let ii = 0; ii <= d; ++ii) {
          for (let kk = 0; kk < 2; ++kk) {
            for (let jj = 0; jj < vvs.length; ++jj) {
              if ((r = test(x + vvs[jj][0] * ii, y + vvs[jj][1] * d, !kk))) {
                return r;
              }
              if ((r = test(x + vvs[jj][0] * d, y + vvs[jj][1] * ii, !kk))) {
                return r;
              }
            }
          }
        }
        ++d;
      }
    }

    mobileGoTo(mobile, x, y, speed) {
      if (!mobile.moving) {
        this.mobiles.push(mobile);
        mobile.moving = true;
      }
      mobile.dest_x = x;
      mobile.dest_y = y;
      mobile.next_x = null;
      mobile.next_y = null;
      mobile.speed = speed;
    }

    mobileFindNext(mobile)
    {
      let x = Math.round(mobile.x);
      let y = Math.round(mobile.y);
      let destx = mobile.dest_x;
      let desty = mobile.dest_y;
      let next = [];
      let done = [];
      let start_key = x + '_' + y;
      done[start_key] = 'start';
      next.push([x, y]);
      while (next.length) {
        let check = next.splice(0, 1)[0];
        let from_key = check[0] + '_' + check[1];
        for (let ii = 0; ii < dx.length; ++ii) {
          let nextx = check[0] + dx[ii];
          let nexty = check[1] + dy[ii];
          let key = nextx + '_' + nexty;
          if (nextx === destx && nexty === desty) {
            // made it! recurse back and find next step
            done[key] = from_key;
            while (done[key] !== start_key) {
              key = done[key];
            }
            let next_step = key.split('_').map(toNumber);
            mobile.next_x = next_step[0];
            mobile.next_y = next_step[1];
            return;
          }
          if (this.mapGet(nextx, nexty, 'state') !== 'green') {
            continue;
          }
          if (done[key]) {
            continue;
          }
          done[key] = from_key;
          next.push([nextx, nexty]);
        }
      }
      if (this.tutorial) {
        return;
      }
      throw 'Cannot find path';
    }

    workerAt(x, y)
    {
      for (let ii = 0; ii < this.workers.length; ++ii) {
        if (Math.round(this.workers[ii].x) === x && Math.round(this.workers[ii].y) === y) {
          return this.workers[ii];
        }
      }
      return false;
    }

    workerNear(x, y, orb_evil)
    {
      for (let ii = 0; ii < this.workers.length; ++ii) {
        if (Math.abs(x - this.workers[ii].x) < 0.25 && Math.abs(y - this.workers[ii].y) < 0.25) {
          if (orb_evil && this.mapGet(Math.round(this.workers[ii].x), Math.round(this.workers[ii].y), 'hp') > 0) {
            // on a fortified square, orbs won't hit them
            continue;
          }
          return this.workers[ii];
        }
      }
      return false;
    }

    isGood(x, y)
    {
      return this.mapGet(x, y, 'hp') > 0 || this.workerAt(x, y);
    }

    needsHealing(x, y)
    {
      let hp = this.mapGet(x, y, 'hp');
      let worker = this.workerAt(x, y);
      return hp > 0 && hp < BOARD_MAX_HP || worker && worker.hp < WORKER_MAX_HP;
    }

    findNearestOrbTarget(x, y, evil)
    {
      let next = [];
      let done = [];
      let start_key = x + '_' + y;
      done[start_key] = true;
      next.push([x, y]);
      while (next.length) {
        let check = next.splice(0, 1)[0];
        for (let ii = 0; ii < dx.length; ++ii) {
          let nextx = check[0] + dx[ii];
          let nexty = check[1] + dy[ii];
          let key = nextx + '_' + nexty;
          if (evil) {
            if (this.isGood(nextx, nexty)) {
              return [nextx, nexty];
            }
          } else {
            if (this.needsHealing(nextx, nexty)) {
              return [nextx, nexty];
            }
          }
          if (this.mapGet(nextx, nexty, 'state') !== 'green') {
            continue;
          }
          if (done[key]) {
            continue;
          }
          done[key] = true;
          next.push([nextx, nexty]);
        }
      }
      if (evil) {
        if (this.tutorial) {
          return [x,y];
        }
        if (this.num_escaped) {
          $('#win_stats').text(this.num_escaped + ' of ' + (TARGET_WORKERS + 2) + ' survived!');
          game_state = winInit;
        } else {
          game_state = loseInit;
        }
        return [0, 0];
      }
      return null;
    }

    emitOrb(x, y, evil) {
      let orb = {
        x,
        y,
        evil,
        detail_x: 0,
        detail_y: 0,
        orig_x: x,
        orig_y: y,
      };
      this.orbs.push(orb);
      let be = this.mapGet(x, y);
      be.orb_out = true;
      let next = this.findNearestOrbTarget(x, y, evil);
      if (next) {
        this.mobileGoTo(orb, next[0], next[1], (this.tutorial ? SPEED_ORB_TUTORIAL : evil ? SPEED_ORB_EVIL : SPEED_ORB_GOOD) * randFloat(0.8, 1));
      }
    }

    updateOrbSpawn(dt) {
      for (let xx in this.map) {
        let x = Number(xx);
        for (let yy in this.map[x]) {
          let y = Number(yy);
          let be = this.mapGet(x, y);
          if (!be) {
            continue;
          }
          if (be.state === 'red' || be.hp && this.workers.length) {
            be.orb_countdown -= dt;
            if (be.orb_countdown < 0 && (!be.orb_out || be.state === 'red')) {
              be.orb_countdown = this.tutorial ? TUTORIAL_RATE : be.hp ? GOOD_RATE : EVIL_RATE;
              this.emitOrb(x, y, !be.hp);
            }
          }
        }
      }
    }

    removeOrb(orb, idx) {
      if (orb.moving) {
        arrayRemove(this.mobiles, this.mobiles.indexOf(orb));
      }
      arrayRemove(this.orbs, idx);
      let be = this.mapGet(orb.orig_x, orb.orig_y);
      if ((be.state === 'red') === orb.evil) {
        be.orb_out = false;
      }
    }

    removeWorker(worker)
    {
      if (worker.moving) {
        arrayRemove(this.mobiles, this.mobiles.indexOf(worker));
      }
      arrayRemove(this.workers, this.workers.indexOf(worker));
      if (worker === this.selected_worker) {
        this.selected_worker = null;
      }
    }

    updateOrbs() {
      for (let ii = this.orbs.length - 1; ii >= 0; --ii) {
        let orb = this.orbs[ii];
        let worker;
        if ((worker = this.workerNear(orb.x, orb.y, orb.evil))) {
          if (orb.evil || worker.hp < WORKER_MAX_HP) {
            if (orb.evil) {
              worker.hp--;
            } else {
              worker.hp++;
            }
            if (!worker.hp) {
              // DIE
              this.removeWorker(worker);
            }
            this.removeOrb(orb, ii);
            continue;
          }
        }
        let int_x = Math.round(orb.x);
        let int_y = Math.round(orb.y);
        if (Math.abs(orb.x - int_x) + Math.abs(orb.y - int_y) < 0.25 && (orb.distance_traveled > 0.5 || int_x !== orb.orig_x || int_y !== orb.orig_y)) {
          let hp = this.mapGet(int_x, int_y, 'hp');
          if (hp > 0 && (orb.evil || hp < BOARD_MAX_HP)) {
            // do damage and end
            let be = this.mapGet(int_x, int_y);
            if (orb.evil) {
              be.hp--;
            } else {
              be.hp++;
            }
            this.removeOrb(orb, ii);
            continue;
          }
        }
        if (!orb.moving) {
          let next = this.findNearestOrbTarget(orb.x, orb.y, orb.evil);
          if (next) {
            this.mobileGoTo(orb, next[0], next[1], (orb.evil ? SPEED_ORB_EVIL : SPEED_ORB_GOOD) * randFloat(0.9, 1));
          }
        }
      }
    }

    updateMobiles(dt) {
      for (let ii = this.mobiles.length - 1; ii >= 0; --ii) {
        let mobile = this.mobiles[ii];
        let dist = mobile.speed * dt;
        while (dist > 0 && mobile.moving) {
          if (mobile.next_x === null) {
            if (mobile.x === mobile.dest_x && mobile.y === mobile.dest_y) {
              // done!
              arrayRemove(this.mobiles, ii);
              mobile.moving = false;
              break;
            }
            this.mobileFindNext(mobile);
          }
          let delta_x = mobile.next_x - mobile.x;
          let delta_y = mobile.next_y - mobile.y;
          let max_delta = Math.max(Math.abs(delta_x), Math.abs(delta_y));
          if (dist > max_delta) {
            mobile.x = mobile.next_x;
            mobile.y = mobile.next_y;
            mobile.next_x = null;
            dist -= max_delta;
            mobile.distance_traveled = (mobile.distance_traveled || 0) + max_delta;
          } else {
            mobile.x += sign(delta_x) * dist;
            mobile.y += sign(delta_y) * dist;
            mobile.distance_traveled = (mobile.distance_traveled || 0) + dist;
            dist = 0;
          }
        }
      }
    }

    allLit() {
      for (let xx in this.map) {
        const x = Number(xx);
        for (let yy in this.map[x]) {
          const y = Number(yy);
          let state =  this.mapGet(x, y, 'state');
          if (state === 'green' && this.mapGet(x, y, 'hp') === 0) {
            return false;
          }
        }
      }
      return true;
    }

    checkGenerateExit() {
      let dist = [];
      let spread = [];
      for (let xx in this.map) {
        const x = Number(xx);
        for (let yy in this.map[x]) {
          const y = Number(yy);
          let state =  this.mapGet(x, y, 'state');
          if (state === 'new_worker') {
            return;
          }
          if (state === 'green') {
            dist[x] = dist[x] || [];
            dist[x][y] = 1;
            spread.push([x, y, 1]);
          }
        }
      }
      // place an exit N steps away from explored territory, nearest the center
      while (spread.length) {
        let next = spread.splice(0, 1)[0];
        let new_dist = next[2] + 1;
        if (new_dist === EXIT_DIST + 1) {
          break;
        }
        for (let ii = 0; ii < dx.length; ++ii) {
          let x = next[0] + dx[ii];
          let y = next[1] + dy[ii];
          dist[x] = dist[x] || [];
          if (!dist[x][y]) {
            dist[x][y] = new_dist;
            spread.push([x,y,new_dist]);
          }
        }
      }
      // everything in spread is distance = EXIT_DIST away
      let best = -1;
      let best_dist = Infinity;
      for (let ii = 0; ii < spread.length; ++ii) {
        let dist = Math.abs(spread[ii][0]) + Math.abs(spread[ii][1]);
        if (dist < best_dist) {
          best = ii;
          best_dist = dist;
        }
      }
      this.mapSet(spread[best][0], spread[best][1], 'exit');
    }

    assignWork(x, y, task) {
      // Do nothing if someone already (going) there
      if (task !== 'exit') {
        for (let ii = 0; ii < this.workers.length; ++ii) {
          let worker = this.workers[ii];
          if (worker.moving && worker.dest_x === x && worker.dest_y === y ||
            worker.x === x && worker.y === y
          ) {
            return;
          }
        }
      }

      // Look for unassigned worker, choose closest
      let worker_idx = -1;
      let best = Infinity;
      if (worker_idx === -1) {
        for (let ii = 0; ii < this.workers.length; ++ii) {
          let worker = this.workers[ii];
          if (worker.assigned_at && worker.task || worker.busy || worker.moving) {
            continue;
          }
          let dist = Math.abs(worker.x - x) + Math.abs(worker.y - y);
          if (dist < best) {
            worker_idx = ii;
            best = dist;
          }
        }
      }
      if (worker_idx === -1) {
        // No free workers, look for oldest assigned repairer who is not moving
        for (let ii = 0; ii < this.workers.length; ++ii) {
          let worker = this.workers[ii];
          if (worker.task) {
            continue;
          }
          if (worker.assigned_at < best) {
            best = worker.assigned_at;
            worker_idx = ii;
          }
        }
      }
      if (worker_idx === -1 && !this.selected_worker) {
        return;
      }
      let worker = this.selected_worker || this.workers[worker_idx];
      this.selected_worker = null;
      this.mobileGoTo(worker, x, y, SPEED_WORKER);
      worker.assigned_at = global_timer;
      worker.task = task;
    }
  }

  function b2sX(x) {
    return game_width / 2 - board_tile_size/2 + x * board_tile_size;
  }
  function b2sY(y) {
    return game_height / 2 - board_tile_size/2 + y * board_tile_size;
  }
  function s2bX(x) {
    return (x - (game_width / 2 - board_tile_size/2)) / board_tile_size;
  }
  function s2bY(y) {
    return (y - (game_height / 2 - board_tile_size/2)) / board_tile_size;
  }
  const chat_options = [
    'Help me!',
    'I\'m scared',
    'Please rescue me!',
    'Oh, please no...',
    'What was that noise?',
    'Why am I here?',
    'It\'s so dark...',
    'I can\'t see anything...',
    'Someone, please...',
    'I need help...',
    'Is that blood?',
    'Who am I?',
    'Where is that sound coming from?',
    'Get me out of here...',
    'I want to go home...',
  ];
  let help_count = 0;
  function randomHelpText() {
    ++help_count;
    if (help_count < 5) {
      return 'Rescue me!';
    }
    return chat_options[Math.floor(Math.random() * chat_options.length)];
  }
  function drawBoard(board, dt) {
    let glow_pulse = 0.75 + 0.25 * Math.sin(global_timer/300) * Math.sin(global_timer/177);
    let minx = Infinity;
    let maxx = -Infinity;
    let miny = Infinity;
    let maxy = -Infinity;
    for (let xx in board.map) {
      const x = Number(xx);
      minx = Math.min(x, minx);
      maxx = Math.max(x, maxx);
      const draw_x = b2sX(x);
      for (let yy in board.map[x]) {
        const y = Number(yy);
        miny = Math.min(y, miny);
        maxy = Math.max(y, maxy);
        let be = board.mapGet(x, y);
        if (!be) {
          continue;
        }
        const draw_y = b2sY(y);
        switch (be.state) {
          case 'green':
            if (be.show_at <= global_timer) {
              draw_list.queue(graphics.board, draw_x, draw_y, Z_BOARD, color_white);
            }
            if (be.hp > 0) {
              for (let ii = 0; ii < BOARD_MAX_HP; ++ii) {
                let color = color_hp_inactive;
                let z = Z_HP_INACTIVE;
                if (be.hp > ii) {
                  color = color_green;
                  z = Z_HP;
                }
                draw_list.queue(graphics.hp,
                  draw_x + hp_tile_pad + hp_pos_x[ii] * hp_tile_size,
                  draw_y + hp_tile_pad + hp_pos_y[ii] * hp_tile_size,
                  z, color);
              }
              draw_list.queue(graphics.hp_center,
                draw_x + board_tile_size/2,
                draw_y + board_tile_size/2,
                Z_HP, [glow_pulse, glow_pulse, glow_pulse, 1]);
            }
            break;
          case 'red':
            let lifetime = global_timer - be.show_at;
            if (lifetime >= 0) {
              let color = color_white;
              if (lifetime < RED_FADE_IN_TIME) {
                color = [1, 1, 1, lifetime / RED_FADE_IN_TIME];
              }
              draw_list.queue(graphics.red, draw_x, draw_y, Z_BOARD, color);
            }
            break;
          case 'new_worker':
            if (be.notify_countdown === 0) {
              be.notify_countdown = Math.random() * (NEW_WORKER_CHAT_MAX - NEW_WORKER_CHAT_MIN) + NEW_WORKER_CHAT_MIN;
            }
            if (dt >= be.notify_countdown) {
              be.notify_countdown = 0;
              notify(draw_x + board_tile_size/2, draw_y + board_tile_size/4, randomHelpText());
            } else {
              be.notify_countdown -= dt;
            }
            draw_list.queue(graphics.worker, draw_x, draw_y, Z_BOARD, color_new_worker);
            break;
          case 'exit':
            draw_list.queue(graphics.exit, draw_x, draw_y, Z_BOARD, [0.75 + 0.25 * Math.sin(global_timer/100), 0.75 + 0.25 * Math.sin(global_timer/107), 0.75 + 0.25 * Math.sin(global_timer/234), 1]);
            break;
        }
      }
    }
    let game_width_fit = Math.max(450, board_tile_size * (Math.max(maxx,-minx)*2 + 1));
    let game_height_fit = Math.max(450, board_tile_size * (Math.max(maxy,-miny)*2 + 1));
    if (board.tutorial) {
      game_width_fit += board_tile_size*2;
      game_height_fit += board_tile_size*2;
    }
    const ZOOM_SPEED = 200/1000;
    let max_zoom = ZOOM_SPEED * dt;
    if (game_width_fit < game_width) {
      game_width = game_width_fit;
    } else {
      game_width = Math.min(game_width + max_zoom, game_width_fit);
    }
    if (game_height_fit < game_height) {
      game_height = game_height_fit;
    } else {
      game_height = Math.min(game_height + max_zoom, game_height_fit);
    }
    board.workers.forEach(function (worker) {
      // draw and update task progress
      let task = '';
      if (!worker.moving) {
        task = worker.task;
        let be = board.mapGet(worker.x, worker.y);
        if (task === 'dig' && be.state !== 'red') {
          worker.task = '';
          worker.assigned_at = 0;
          task = '';
        }
        if (!task && be.hp < BOARD_MAX_HP) {
          task = 'repair';
        }
        if (task) {
          // update
          be.task_counter += dt;
          if (task === 'dig' || task === 'new_worker') {
            worker.busy = true;
            let task_time = board.tutorial ? DIG_TIME_TUTORIAL : DIG_TIME;
            if (be.task_counter > task_time) {
              // done!
              let new_pos = board.findNearestEmpty(worker.x, worker.y);
              switch (task) {
                case 'dig':
                  board.generateRoom(worker.x, worker.y);
                  break;
                case 'new_worker':
                  let new_worker = new Worker(worker.x, worker.y);
                  board.workers.push(new_worker);
                  board.mapSet(worker.x, worker.y, 'red');
                  board.generateRoom(worker.x, worker.y, 1);
                  board.checkGenerateExit();
                  break;
              }
              worker.task = '';
              worker.assigned_at = 0;
              worker.busy = false;
              board.mobileGoTo(worker, new_pos[0], new_pos[1], SPEED_WORKER);
              if (board.tutorial_state === 3) {
                delete board.tutorial_state;
                $('#play_tutorial3').fadeOut();
                $('#play_tutorial4').fadeIn();
                setTimeout(function () {
                  $('#play_tutorial4').fadeOut();
                }, 5000);
              }
            }
          } else if (task === 'repair') {
            let task_time = REPAIR_TIME;
            let be = board.mapGet(worker.x, worker.y);
            while (be.task_counter > task_time) {
              be.task_counter -= task_time;
              if (be.hp === 4 && board.tutorial_state === 1) {
                $('#play_tutorial1').fadeOut();
                ++board.tutorial_state;
                $('#play_tutorial2').fadeIn();
              }
              be.hp = Math.min(BOARD_MAX_HP, be.hp + 1);
              if (board.tutorial_state === 2) {
                if (board.allLit()) {
                  $('#play_tutorial2').fadeOut();
                  ++board.tutorial_state;
                  $('#play_tutorial3').fadeIn();
                }
              }
            }
            if (be.hp < BOARD_MAX_HP - 2) {
              worker.busy = true;
            } else if (be.hp === BOARD_MAX_HP) {
              // let new_pos = board.findNearestEmpty(worker.x, worker.y);
              worker.assigned_at = 0;
              be.task_counter = 0;
              worker.busy = false;
              // board.mobileGoTo(worker, new_pos[0], new_pos[1], SPEED_WORKER);
            } // else leave busy
          } else if (task === 'exit') {
            board.num_escaped++;
            // remove worker
            board.removeWorker(worker);
          }
        } else {
          worker.busy = false;
        }
        // draw task progress
        if (task && task !== 'exit' && task !== 'disabled') {
          let sprite, progress;
          let scale = 1;
          let z = Z_TASK_PROGRESS;
          switch (task) {
            case 'repair':
              sprite = graphics.hp_progress;
              progress = 0.92 * be.task_counter / REPAIR_TIME;
              scale = worker_scale;
              z = Z_WORKER + 1;
              break;
            case 'new_worker':
            case 'dig':
              sprite = graphics.dig_progress;
              progress = be.task_counter / (board.tutorial ? DIG_TIME_TUTORIAL : DIG_TIME);
              break;
          }
          draw_list.queue(sprite, b2sX(worker.x + (1 - scale)/2), b2sY(worker.y + (1 - progress)*scale + (1-scale)/2), z, color_yellow,
            [1 * scale, progress * scale], mathDevice.v4Build(0, 128 * (1 - progress), 128, 128));
        }
      } else {
        worker.busy = false;
      }

      // draw worker
      let color = color_white;
      switch (task) {
        case 'dig':
          color = color_yellow;
          break;
        case 'repair':
          color = [0.8, 1, 0.8, 1];
          break;
      }
      let draw_x = worker.x;
      let draw_y = worker.y;
      if (board.mapGet(Math.round(worker.x), Math.round(worker.y), 'state') === 'green') {
        worker.last_safe_x = worker.x;
        worker.last_safe_y = worker.y;
        worker.using_safe = false;
      } else {
        draw_x = worker.last_safe_x;
        draw_y = worker.last_safe_y;
        worker.using_safe = true;
      }
      worker.draw_x = draw_x;
      worker.draw_y = draw_y;
      draw_list.queue(graphics.worker, b2sX(draw_x + (1 - worker_scale)/2), b2sY(draw_y + (1 - worker_scale)/2), Z_WORKER,
        color, [worker_scale, worker_scale]);

      let hp = worker.hp;
      if (hp < WORKER_MAX_HP) {
        // draw worker injury
        let damage = 0.1 + 0.8 * (WORKER_MAX_HP - hp) / WORKER_MAX_HP;
        draw_list.queue(graphics.worker_damage, b2sX(draw_x + (1 - worker_scale)/2), b2sY(draw_y + (1 - damage)*worker_scale + (1-worker_scale)/2), Z_WORKER_DAMAGE, color_red,
          [1 * worker_scale, damage * worker_scale], mathDevice.v4Build(0, 128 * (1 - damage), 128, 128));
      }

      if (worker === board.selected_worker) {
        let scale = 0.95;
        draw_list.queue(graphics.highlight, b2sX(draw_x + (1 - scale)/2), b2sY(draw_y + (1 - scale)/2), Z_HIGHLIGHT, [1, 1, 0, 1],
          [scale, scale]);
      }
    });
    board.orbs.forEach(function (orb) {
      let color = color_green;
      if (orb.evil) {
        color = color_red;
      }
      let speed = orb.evil ? 4/1000 : 1/1000;
      let range = orb.evil ? 0.33 : 0.22;
      orb.detail_x = orb.detail_x + randFloat(-1, 1) * dt * speed;
      orb.detail_x = Math.min(Math.max(orb.detail_x, -range), range);
      orb.detail_y = orb.detail_y + randFloat(-1, 1) * dt * speed;
      orb.detail_y = Math.min(Math.max(orb.detail_y, -range), range);
      draw_list.queue(graphics.orb, b2sX(orb.x + orb.detail_x), b2sY(orb.y + orb.detail_y), Z_ORB, color, [1, 1]);
    });
  }

  function checkMouse(board)
  {
    let mouse_pos = input.mousePos();
    let fx = s2bX(mouse_pos[0]);
    let fy = s2bY(mouse_pos[1]);
    let x = Math.floor(fx);
    let y = Math.floor(fy);
    fx -= 0.5;
    fy -= 0.5;
    let state = board.mapGet(x, y, 'state');
    let highlight = false;
    let highlight_worker;
    for (let ii = 0; ii < board.workers.length; ++ii) {
      let worker = board.workers[ii];
      if (Math.sqrt(Math.abs(fx - worker.draw_x)*Math.abs(fx - worker.draw_x) + Math.abs(fy - worker.draw_y)*Math.abs(fy - worker.draw_y)) < 0.65) {
        // near worker!
        highlight = [Math.random(), 1, Math.random(), 1];
        highlight_worker = worker;
      }
    }
    let neighbor;
    if (!highlight && state === 'green') {
      highlight = color_green;
    } else if (!highlight && board.tutorial_state !== 1 && board.tutorial_state !== 2) {
      // is neighbor green?
      neighbor = board.mapIsNeighbor(x, y);
      if (neighbor) {
        if (state === 'new_worker') {
          highlight = color_white;
        } else if (state === 'exit') {
          highlight = [Math.random(), Math.random(), Math.random(), 1];
        } else {
          highlight = color_yellow;
        }
      }
    }
    if (highlight_worker) {
      // draw it smaller, just around the worker
      let scale = 0.9;
      draw_list.queue(graphics.highlight, b2sX(highlight_worker.draw_x + (1 - scale)/2), b2sY(highlight_worker.draw_y + (1 - scale)/2), Z_HIGHLIGHT, highlight,
        [scale, scale]);
      if (input.clickHit(-Infinity, -Infinity, Infinity, Infinity)) {
        // select worker
        if (board.selected_worker === highlight_worker) {
          board.selected_worker = null;
        } else {
          board.selected_worker = highlight_worker;
        }
      }
    } else if (highlight) {
      if (neighbor) {
        // draw segmented
        for (let ii = 0; ii < neighbor.length; ++ii) {
          draw_list.queue(graphics['highlight_' + neighbor[ii]], b2sX(x), b2sY(y), Z_HIGHLIGHT, highlight);
        }
      } else {
        draw_list.queue(graphics.highlight, b2sX(x), b2sY(y), Z_HIGHLIGHT, highlight);
      }
      if (input.clickHit(-Infinity, -Infinity, Infinity, Infinity)) {
        board.assignWork(x, y, state === 'red' ? 'dig' : state === 'new_worker' ? 'new_worker' :
          state === 'exit' ? 'exit' : '');
      }
    }
  }

  let board;
  function play(dt) {
    if (!board.workers.length) {
      dt = dt * 10;
    }
    board.updateOrbSpawn(dt);
    board.updateOrbs(dt);
    board.updateMobiles(dt);
    drawBoard(board, dt);
    checkMouse(board, dt);
  }

  function tutorial(dt) {
    board.updateOrbSpawn(dt);
    board.updateOrbs(dt);
    board.updateMobiles(dt);
    drawBoard(board, dt);
    board.updateTutorial(dt);
  }

  function playInit(dt) {
    board = new Board();
    initGraphics();
    $('.screen').hide();
    $('#play').show();
    $('#play_tutorial').show();
    $('.play_tutorial').hide();
    $('#play_tutorial1').show();
    board.tutorial_state = 1;
    game_state = play;
    play(dt);
  }

  function tutorialInit(dt) {
    board = new Board(true);
    initGraphics();
    $('.screen').hide();
    $('#play').show();
    $('#tutorial').show();
    game_state = tutorial;
    tutorial(dt);
  }

/*  function test(dt) {
    // test.sprite.x = (Math.random() * (game_width - spriteSize) + (spriteSize * 0.5));
    // test.sprite.y = (Math.random() * (game_height - spriteSize) + (spriteSize * 0.5));

    let character = {
      dx: 0,
      dy: 0,
    };
    if (input.isKeyDown(keyCodes.LEFT) || input.isKeyDown(keyCodes.A) || input.isPadButtonDown(0, padCodes.LEFT)) {
      character.dx = -1;
    } else if (input.isKeyDown(keyCodes.RIGHT) || input.isKeyDown(keyCodes.D) || input.isPadButtonDown(0, padCodes.RIGHT)) {
      character.dx = 1;
    }
    if (input.isKeyDown(keyCodes.UP) || input.isKeyDown(keyCodes.W) || input.isPadButtonDown(0, padCodes.UP)) {
      character.dy = -1;
    } else if (input.isKeyDown(keyCodes.DOWN) || input.isKeyDown(keyCodes.S) || input.isPadButtonDown(0, padCodes.DOWN)) {
      character.dy = 1;
    }

    test.sprite.x += character.dx * dt * 0.2;
    test.sprite.y += character.dy * dt * 0.2;
  }
*/
  function title() {
    //test(dt);
    if ('ready') {
      game_state = playInit;
    }
  }

  function titleInit(dt) {
    $('.screen').hide();
    $('#title').show();
    game_state = title;
    title(dt);
  }


  $('.play_again').click(function () {
    game_state = playInit;
  });

  function lose() {
  }

  function loseInit(dt) {
    $('.screen').hide();
    $('#lose').show();
    game_state = lose;
    lose(dt);
  }

  function win() {
  }

  function winInit(dt) {
    $('.screen').hide();
    $('#win').show();
    game_state = win;
    win(dt);
  }

  //game_state = tutorialInit;
  game_state = playInit;

  let last_tick = Date.now();
  let last_game_width = game_width;
  let last_game_height = game_height;
  function tick() {
    if (!graphicsDevice.beginFrame()) {
      return;
    }
    const now = Date.now();
    const dt = Math.min(Math.max(now - last_tick, 1), 100);
    last_tick = now;
    global_timer += dt;
    input.tick();

    {
      let screen_width = graphicsDevice.width;
      let screen_height = graphicsDevice.height;
      let screen_aspect = screen_width / screen_height;
      let view_aspect = game_width / game_height;
      const configureParams = {
        scaleMode : 'scale',
        viewportRectangle : mathDevice.v4Build(0, 0, game_width, game_height)
      };

      if (screen_aspect > view_aspect) {
        let viewport_width = game_height * screen_aspect;
        let half_diff = (viewport_width - game_width) / 2;
        configureParams.viewportRectangle = [-half_diff, 0, game_width + half_diff, game_height];
      } else {
        let viewport_height = game_width / screen_aspect;
        let half_diff = (viewport_height - game_height) / 2;
        configureParams.viewportRectangle = [0, -half_diff, game_width, game_height + half_diff];
      }
      draw2D.configure(configureParams);
    }

    if (window.need_repos || game_width !== last_game_width || game_height !== last_game_height) {
      if (window.need_repos) {
        --window.need_repos;
      }
      last_game_width = game_width;
      last_game_height = game_height;
      const ul = draw2D.viewportUnmap(0, 0);
      const lr = draw2D.viewportUnmap(game_width-1, game_height-1);
      const viewport = [ul[0], ul[1], lr[0], lr[1]];
      const height = viewport[3] - viewport[1];
      // default font size of 16 when at height of game_height
      const font_size = Math.min(256, Math.max(2, Math.floor(height/800 * 16)));
      $('#gamescreen').css({
        left: viewport[0],
        top: viewport[1],
        width: viewport[2] - viewport[0],
        height: height,
        'font-size': font_size,
      });
      $('#fullscreen').css({
        'font-size': font_size,
      });
    }

    draw2D.setBackBuffer();
    draw2D.clear([0, 0, 0, 1]);

    draw2D.begin('alpha', 'deferred');

    game_state(dt);
    draw_list.draw();

    draw2D.end();
    graphicsDevice.endFrame();
  }

  intervalID = TurbulenzEngine.setInterval(tick, 1000/60);
};
