class Level {
  constructor(id, data, gimmick, background = 'none') {
    this.id       = id;
    this.data     = data;
    this.gimmick  = gimmick || 'NIL';
    this.g        = this.gimmick.split(' ');

    // Which background to render for this level
    this.background = background;

    // Determine level bounds from the furthest element in each direction
    let tempParts = this.data.split(' ');
    let xArray = [], yArray = [];
    tempParts.forEach((p) => {
      let coords = p.slice(2, p.length).split('z');
      xArray.push(Number(coords[0]) + Number(coords[2]));
      yArray.push(Number(coords[1]));
    });
    this.w = width  / 40 * Math.max(...xArray.filter(v => !isNaN(v)), 40);
    this.h = height / 40 * Math.max(...yArray.filter(v => !isNaN(v)), 40);
  }
}