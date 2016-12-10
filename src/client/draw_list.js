function cmpDrawList(a, b) {
  if (a.z !== b.z) {
    return a.z - b.z;
  }
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  return a.x - b.x;
}

const unit_vec4 = [1,1,1,1];

class GlovDrawList {
  constructor(draw2d) {
    this.draw2d = draw2d;
    this.list = [];
  }

  queue(sprite, x, y, z, color, scale, tex_rect) {
    sprite.test = 1;
    let elem = {
      sprite,
      x, y, z,
      color,
      scale: scale || unit_vec4,
      tex_rect,
    };
    this.list.push(elem);
  }


  draw() {
    this.list.sort(cmpDrawList);
    for (let ii = 0; ii < this.list.length; ++ii) {
      let elem = this.list[ii];
      let sprite = elem.sprite;
      sprite.x = elem.x;
      sprite.y = elem.y;
      sprite.setScale(elem.scale);
      sprite.setColor(elem.color);
      if (elem.tex_rect) {
        sprite.setTextureRectangle(elem.tex_rect);
      }
      this.draw2d.drawSprite(sprite);
    }
    this.list.length = 0;
  }
}

export function create(draw2d) {
  return new GlovDrawList(draw2d);
}
