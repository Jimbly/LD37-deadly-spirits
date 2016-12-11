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
  const TASK_TIME = 1000; //8000;
  const REPAIR_TIME = 8000/16;
  const BOARD_MAX_HP = 16;
  const WORKER_SPEED = 4/1000;

  const Z_BOARD  = 0;
  const Z_HP = 1;
  const Z_TASK_PROGRESS = 2;
  const Z_WORKER = 3;
  const Z_HP_INACTIVE = 4;
  const Z_HIGHLIGHT = 100;

  const dx = [-1, 1, 0, 0];
  const dy = [0, 0, -1, 1];
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
  let rand = random_seed.create('appleseed');

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
  const game_width = 1280;
  const game_height = 960;
  const color_white = mathDevice.v4Build(1, 1, 1, 1);
  const color_green = mathDevice.v4Build(0, 1, 0, 1);
  //const color_red = mathDevice.v4Build(1, 0, 0, 1);
  const color_hp_inactive = mathDevice.v4Build(0.5, 0, 0, 0.5);
  const color_yellow = mathDevice.v4Build(1, 1, 0, 1);
  const color_new_worker = mathDevice.v4Build(1, 1, 1, 0.25);

  const board_tile_size = 64;
  const hp_tile_size = board_tile_size / 6;
  const hp_tile_pad = hp_tile_size;
  const worker_scale = 0.67;

  // Cache keyCodes
  // const keyCodes = inputDevice.keyCodes;
  // const padCodes = input.padCodes;

  const configureParams = {
    scaleMode : 'scale',
    viewportRectangle : mathDevice.v4Build(0, 0, game_width, game_height)
  };

  let game_state;

  let graphics = {};

  function initGraphics() {
    const sprite_size = 64;
    let color_sprite = color_white;
    function loadSprite(name, texres, size_override) {
      graphics[name] = createSprite(name + '.png', {
        width : size_override || sprite_size,
        height : size_override || sprite_size,
        x : 0,
        y : 0,
        origin: [0,0],
        rotation : 0,
        color : color_sprite,
        textureRectangle : mathDevice.v4Build(0, 0, texres, texres)
      });
    }
    loadSprite('board', 256);
    loadSprite('highlight', 256);
    loadSprite('worker', 128);
    loadSprite('dig_progress', 128);
    loadSprite('hp_progress', 128);
    loadSprite('red', 128);
    loadSprite('hp', 32, hp_tile_size);
  }

  class BoardEntry {
    constructor() {
      this.state = null;
      this.hp = 0;
    }
  }

  class Worker {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.assigned_at = 0;
      this.task = '';
      this.task_counter = 0;
    }
  }

  class Board {
    constructor() {
      this.map = [];
      this.workers = [];
      this.mobiles = [];
      let init_workers = 2;

      for (let ii = -1; ii <= 1; ++ii) {
        for (let jj = -1; jj <= 1; ++jj) {
          this.mapSet(ii, jj, 'green', (jj !== 1) ? BOARD_MAX_HP : 0);
          if (init_workers) {
            --init_workers;
            this.workers.push(new Worker(ii, jj));
          }
        }
      }
      for (let ii = -2; ii <= 2; ++ii) {
        for (let jj = -2; jj <= 2; ++jj) {
          if (this.mapIsNeighbor(ii, jj)) {
            this.mapSet(ii, jj, 'red');
          }
        }
      }

      this.mapSet(3, 5, 'new_worker');
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
      if (state && state !== 'red' && state !== 'new_worker') {
        return false;
      }
      for (let ii = 0; ii < dx.length; ++ii) {
        state = this.mapGet(x + dx[ii], y + dy[ii], 'state');
        if (state === 'green') {
          return true;
        }
      }
      return false;
    }

    mapSet(x, y, state, hp) {
      this.map[x] = this.map[x] || [];
      this.map[x][y] = this.map[x][y] || new BoardEntry();
      this.map[x][y].state = state;
      this.map[x][y].hp = hp;
    }

    generateRoom(x, y, force_size) {
      const sizes = [3, 10, 20];
      let size = 2 + rand(sizes[rand(sizes.length)]);
      if (force_size) {
        size = force_size;
      }
      let neighbors = [];
      let board = this;
      function clear(x, y) {
        let existing_state = board.mapGet(x, y, 'state');
        if (existing_state && existing_state !== 'red') {
          return;
        }
        --size;
        board.mapSet(x, y, 'green', 0);
        for (let ii = 0; ii < dx.length; ++ii) {
          neighbors.push([x + dx[ii], y + dy[ii]]);
          if (!board.mapGet(x + dx[ii], y + dy[ii], 'state')) {
            board.mapSet(x + dx[ii], y + dy[ii], 'red');
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
      let d = 1;
      let worker_at = [];
      this.workers.forEach(function (worker) {
        worker_at[worker.x] = worker_at[worker.x] || [];
        worker_at[worker.x][worker.y] = true;
      });
      let board = this;
      function test(x, y) {
        if (board.mapGet(x, y, 'state') === 'green') {
          if (!worker_at[x] || !worker_at[x][y]) {
            return [x, y];
          }
        }
      }
      while (true) {
        let r;
        let vvs = [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ];
        for (let ii = 0; ii <= d; ++ii) {
          for (let jj = 0; jj < vvs.length; ++jj) {
            if ((r = test(x + vvs[jj][0] * ii, y + vvs[jj][1] * d))) {
              return r;
            }
            if ((r = test(x + vvs[jj][0] * d, y + vvs[jj][1] * ii))) {
              return r;
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
      let x = mobile.x;
      let y = mobile.y;
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
      throw 'Cannot find path';
    }

    updateMobiles(dt) {
      for (let ii = this.mobiles.length - 1; ii >= 0; --ii) {
        let mobile = this.mobiles[ii];
        let dist = mobile.speed * dt;
        while (dist > 0 && mobile.moving) {
          if (mobile.next_x === null) {
            if (mobile.x === mobile.dest_x && mobile.y === mobile.dest_y) {
              // done!
              this.mobiles[ii] = this.mobiles[this.mobiles.length - 1];
              this.mobiles.pop();
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
          } else {
            mobile.x += sign(delta_x) * dist;
            mobile.y += sign(delta_y) * dist;
            dist = 0;
          }
        }
      }
    }

    assignWork(x, y, task) {
      // Do nothing if someone alread ythere
      for (let ii = 0; ii < this.workers.length; ++ii) {
        let worker = this.workers[ii];
        if (worker.x === x && worker.y === y) {
          return;
        }
      }

      // Look for unassigned worker, choose closest
      let worker_idx = -1;
      let best = Infinity;
      for (let ii = 0; ii < this.workers.length; ++ii) {
        let worker = this.workers[ii];
        if (worker.assigned_at) {
          continue;
        }
        if (worker.moving) {
          continue;
        }
        let dist = Math.abs(worker.x - x) + Math.abs(worker.y - y);
        if (dist < best) {
          worker_idx = ii;
          best = dist;
        }
      }
      if (worker_idx === -1) {
        return;
      }
      let worker = this.workers[worker_idx];
      this.mobileGoTo(worker, x, y, WORKER_SPEED);
      if (task) {
        worker.assigned_at = global_timer;
      }
      worker.task = task;
      worker.task_counter = 0;
    }
  }

  let board_origin_x = game_width / 2 - board_tile_size/2;
  let board_origin_y = game_height / 2 - board_tile_size/2;
  function b2sX(x) {
    return board_origin_x + x * board_tile_size;
  }
  function b2sY(y) {
    return board_origin_y + y * board_tile_size;
  }
  function s2bX(x) {
    return Math.floor((x - board_origin_x) / board_tile_size);
  }
  function s2bY(y) {
    return Math.floor((y - board_origin_y) / board_tile_size);
  }
  function drawBoard(board, dt) {
    for (let xx in board.map) {
      const x = Number(xx);
      const draw_x = b2sX(x);
      for (let yy in board.map[x]) {
        const y = Number(yy);
        let be = board.mapGet(x, y);
        if (!be) {
          continue;
        }
        const draw_y = b2sY(y);
        switch (be.state) {
          case 'green':
            draw_list.queue(graphics.board, draw_x, draw_y, Z_BOARD, color_white);
            if (be.hp > 0) {
              for (let ii = 0; ii < 16; ++ii) {
                let color = color_hp_inactive;
                let z = Z_HP_INACTIVE;
                if (be.hp >= 16 - ii) {
                  color = color_green;
                  z = Z_HP;
                }
                draw_list.queue(graphics.hp,
                  draw_x + hp_tile_pad + (ii % 4) * hp_tile_size,
                  draw_y + hp_tile_pad + Math.floor(ii / 4) * hp_tile_size,
                  z, color);
              }
            }
            break;
          case 'red':
            draw_list.queue(graphics.red, draw_x, draw_y, Z_BOARD, color_white);
            break;
          case 'new_worker':
            draw_list.queue(graphics.worker, draw_x, draw_y, Z_BOARD, color_new_worker);
            break;
        }
      }
    }
    board.workers.forEach(function (worker) {
      // draw and update task progress
      if (worker.task && !worker.moving) {
        // update
        worker.task_counter += dt;
        if (worker.task === 'dig' || worker.task === 'new_worker') {
          let task_time = TASK_TIME;
          if (worker.task_counter > task_time) {
            // done!
            let new_pos = board.findNearestEmpty(worker.x, worker.y);
            switch (worker.task) {
              case 'dig':
                board.generateRoom(worker.x, worker.y);
                break;
              case 'new_worker':
                let new_worker = new Worker(worker.x, worker.y);
                board.workers.push(new_worker);
                board.mapSet(worker.x, worker.y, 'red');
                board.generateRoom(worker.x, worker.y, 1);
                break;
            }
            worker.task = '';
            worker.assigned_at = 0;
            worker.task_counter = 0;
            board.mobileGoTo(worker, new_pos[0], new_pos[1], WORKER_SPEED);
          }
        } else if (worker.task === 'repair') {
          let task_time = REPAIR_TIME;
          let be = board.mapGet(worker.x, worker.y);
          while (worker.task_counter > task_time) {
            worker.task_counter -= task_time;
            be.hp = Math.min(BOARD_MAX_HP, be.hp + 1);
          }
          if (be.hp === BOARD_MAX_HP) {
            let new_pos = board.findNearestEmpty(worker.x, worker.y);
            worker.task = '';
            worker.assigned_at = 0;
            worker.task_counter = 0;
            board.mobileGoTo(worker, new_pos[0], new_pos[1], WORKER_SPEED);
          }
        }
      }
      // draw
      if (worker.task && !worker.moving) {
        let sprite, progress;
        let scale = 1;
        let z = Z_TASK_PROGRESS;
        switch (worker.task) {
          case 'repair':
            sprite = graphics.hp_progress;
            progress = worker.task_counter / REPAIR_TIME;
            scale = worker_scale;
            z = Z_WORKER + 1;
            break;
          case 'new_worker':
          case 'dig':
            sprite = graphics.dig_progress;
            progress = worker.task_counter / TASK_TIME;
            break;
        }
        draw_list.queue(sprite, b2sX(worker.x + (1 - scale)/2), b2sY(worker.y + (1 - progress)*scale + (1-scale)/2), z, color_yellow,
          [1 * scale, progress * scale], mathDevice.v4Build(0, 128 * (1 - progress), 128, 128));
      }

      // draw worker
      let color = color_white;
      switch (worker.task) {
        case 'dig':
          color = color_yellow;
          break;
        case 'repair':
          color = [0.8, 1, 0.8, 1];
          break;
      }
      draw_list.queue(graphics.worker, b2sX(worker.x + (1 - worker_scale)/2), b2sY(worker.y + (1 - worker_scale)/2), Z_WORKER,
        color, [worker_scale, worker_scale]);
    });
  }

  function checkMouse(board)
  {
    let mouse_pos = input.mousePos();
    let x = s2bX(mouse_pos[0]);
    let y = s2bY(mouse_pos[1]);
    let state = board.mapGet(x, y, 'state');
    let highlight = false;
    if (state === 'green') {
      highlight = color_green;
    } else {
      // is neighbor green?
      if (board.mapIsNeighbor(x, y)) {
        if (state === 'new_worker') {
          highlight = color_white;
        } else {
          highlight = color_yellow;
        }
      }
    }
    if (highlight) {
      draw_list.queue(graphics.highlight, b2sX(x), b2sY(y), Z_HIGHLIGHT, highlight);
      if (input.clickHit(-Infinity, -Infinity, Infinity, Infinity)) {
        board.assignWork(x, y, state === 'red' ? 'dig' : state === 'new_worker' ? 'new_worker' :
          board.mapGet(x, y, 'hp') === BOARD_MAX_HP ? '' : 'repair');
      }
    }
  }

  let board = new Board();

  function play(dt) {
    board.updateMobiles(dt);
    drawBoard(board, dt);
    checkMouse(board, dt);
  }

  function playInit(dt) {
    initGraphics();
    $('.screen').hide();
    $('#play').show();
    game_state = play;
    play(dt);
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

  game_state = titleInit;

  let last_tick = Date.now();
  function tick() {
    if (!graphicsDevice.beginFrame()) {
      return;
    }
    const now = Date.now();
    const dt = Math.min(Math.max(now - last_tick, 1), 250);
    last_tick = now;
    global_timer += dt;
    input.tick();

    {
      let screen_width = graphicsDevice.width;
      let screen_height = graphicsDevice.height;
      let screen_aspect = screen_width / screen_height;
      let view_aspect = game_width / game_height;
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

    if (window.need_repos) {
      --window.need_repos;
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
