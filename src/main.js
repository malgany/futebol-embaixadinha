const {
  Body,
  Bodies,
  Composite,
  Constraint,
  Engine,
  Events,
  Render,
  Runner,
  Vector
} = window.Matter;

const WORLD_WIDTH = 390;
const WORLD_HEIGHT = 844;
const HALF_HEIGHT = WORLD_HEIGHT / 2;
const LINK_LENGTH = 112;
const LINK_WIDTH = 12;
const CONTROL_SCALE = 1.35;
const COLLISION = {
  PENDULUM: 0x0001,
  NET_BORDER: 0x0002,
  NET_INNER: 0x0004
};
const NET = {
  x: 104,
  y: 112,
  width: 182,
  height: 176,
  rows: 6,
  columns: 9,
  particleRadius: 4,
  stiffness: 0.22
};

const phone = document.querySelector("#phone");
const root = document.querySelector("#matter-root");

const engine = Engine.create({
  gravity: { x: 0, y: 1, scale: 0.0018 }
});

const render = Render.create({
  element: root,
  engine,
  options: {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    pixelRatio: window.devicePixelRatio || 1,
    background: "transparent",
    wireframes: false,
    hasBounds: false
  }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

const controls = {
  left: createController("left"),
  right: createController("right")
};

const pendulums = [
  createPendulum({
    side: "left",
    x: WORLD_WIDTH * 0.37,
    y: 128,
    tilt: 0
  }),
  createPendulum({
    side: "right",
    x: WORLD_WIDTH * 0.63,
    y: 128,
    tilt: 0
  })
];

const net = createNet();

Composite.add(engine.world, [
  net.composite,
  ...pendulums.flatMap((pendulum) => pendulum.parts),
  ...Object.values(controls).map((control) => control.constraint)
]);

const activePointers = new Map();

window.addEventListener("resize", updatePixelRatio, { passive: true });
phone.addEventListener("pointerdown", handlePointerDown);
phone.addEventListener("pointermove", handlePointerMove);
phone.addEventListener("pointerup", handlePointerUp);
phone.addEventListener("pointercancel", handlePointerUp);
phone.addEventListener("lostpointercapture", handlePointerUp);

Events.on(render, "afterRender", drawSceneSkin);
Events.on(engine, "afterUpdate", keepPendulumsInPlay);

function createNet() {
  const composite = Composite.create({ label: "fluid net" });
  const nodes = [];
  const columnGap = NET.width / (NET.columns - 1);
  const rowGap = NET.height / (NET.rows - 1);

  for (let row = 0; row < NET.rows; row += 1) {
    nodes[row] = [];

    for (let column = 0; column < NET.columns; column += 1) {
      const isCollider = isNetCollider(row, column);
      const particle = Bodies.circle(NET.x + column * columnGap, NET.y + row * rowGap, NET.particleRadius, {
        inertia: Infinity,
        friction: 0.00001,
        frictionAir: 0.015,
        restitution: 0.05,
        isStatic: row === 0 && (column === 0 || column === NET.columns - 1),
        collisionFilter: {
          category: isCollider ? COLLISION.NET_BORDER : COLLISION.NET_INNER,
          mask: isCollider ? COLLISION.PENDULUM : 0
        },
        render: { visible: false }
      });

      nodes[row][column] = particle;
      Composite.add(composite, particle);
    }
  }

  for (let row = 0; row < NET.rows; row += 1) {
    for (let column = 0; column < NET.columns; column += 1) {
      if (column < NET.columns - 1) {
        addNetConstraint(composite, nodes[row][column], nodes[row][column + 1], columnGap);
      }

      if (row < NET.rows - 1) {
        addNetConstraint(composite, nodes[row][column], nodes[row + 1][column], rowGap);
      }
    }
  }

  return {
    composite,
    nodes
  };
}

function isNetCollider(row, column) {
  return row === 0 || column === 0 || column === NET.columns - 1;
}

function addNetConstraint(composite, bodyA, bodyB, length) {
  Composite.add(composite, Constraint.create({
    bodyA,
    bodyB,
    length,
    stiffness: NET.stiffness,
    damping: 0.02,
    render: { visible: false }
  }));
}

function createPendulum({ side, x, y, tilt }) {
  const group = Body.nextGroup(true);
  const linkOptions = {
    collisionFilter: {
      group,
      category: COLLISION.PENDULUM,
      mask: COLLISION.NET_BORDER
    },
    density: 0.004,
    friction: 0,
    frictionAir: 0.006,
    restitution: 0,
    chamfer: { radius: 5 },
    render: {
      visible: false
    }
  };

  const upper = Bodies.rectangle(x, y + LINK_LENGTH / 2, LINK_WIDTH, LINK_LENGTH, linkOptions);
  const lower = Bodies.rectangle(x, y + LINK_LENGTH * 1.5, LINK_WIDTH, LINK_LENGTH, linkOptions);

  Body.rotate(upper, tilt, { x, y });
  Body.rotate(lower, -tilt * 2, { x, y: y + LINK_LENGTH });

  const topJoint = Constraint.create({
    pointA: { x, y },
    bodyB: upper,
    pointB: { x: 0, y: -LINK_LENGTH / 2 },
    length: 0,
    stiffness: 0.92,
    angularStiffness: 0.7,
    render: { strokeStyle: "#111827", lineWidth: 2 }
  });

  const kneeJoint = Constraint.create({
    bodyA: upper,
    pointA: { x: 0, y: LINK_LENGTH / 2 },
    bodyB: lower,
    pointB: { x: 0, y: -LINK_LENGTH / 2 },
    length: 0,
    stiffness: 0.9,
    angularStiffness: 0.55,
    render: { strokeStyle: "#111827", lineWidth: 2 }
  });

  controls[side].constraint.bodyB = lower;
  controls[side].constraint.pointB = { x: 0, y: LINK_LENGTH / 2 };
  controls[side].constraint.angleB = lower.angle;
  controls[side].rest = { x, y: y + LINK_LENGTH * 1.85 };
  controls[side].target = Vector.clone(controls[side].rest);
  controls[side].constraint.pointA = Vector.clone(controls[side].target);

  return {
    side,
    upper,
    lower,
    anchor: { x, y },
    parts: [upper, lower, topJoint, kneeJoint]
  };
}

function createController(side) {
  return {
    side,
    pointerId: null,
    startPoint: null,
    startTarget: null,
    target: { x: 0, y: 0 },
    rest: { x: 0, y: 0 },
    constraint: Constraint.create({
      pointA: { x: 0, y: 0 },
      bodyB: null,
      pointB: { x: 0, y: 0 },
      length: 0,
      stiffness: 0,
      damping: 0.12,
      render: { visible: false }
    })
  };
}

function handlePointerDown(event) {
  const point = toWorldPoint(event);

  if (point.y < HALF_HEIGHT) {
    return;
  }

  const side = point.x < WORLD_WIDTH / 2 ? "left" : "right";
  const control = controls[side];

  if (control.pointerId !== null) {
    return;
  }

  phone.setPointerCapture(event.pointerId);
  control.pointerId = event.pointerId;
  control.startPoint = point;
  control.startTarget = Vector.clone(control.target);
  control.constraint.stiffness = 0.16;
  activePointers.set(event.pointerId, side);
  updateControlGlow(side, point);
  phone.classList.add(`is-${side}-active`);
  event.preventDefault();
}

function handlePointerMove(event) {
  const side = activePointers.get(event.pointerId);

  if (!side) {
    return;
  }

  const point = toWorldPoint(event);
  const control = controls[side];
  const delta = Vector.mult(Vector.sub(point, control.startPoint), CONTROL_SCALE);
  const nextTarget = Vector.add(control.startTarget, delta);

  control.target.x = clamp(nextTarget.x, 44, WORLD_WIDTH - 44);
  control.target.y = clamp(nextTarget.y, 82, HALF_HEIGHT - 18);
  control.constraint.pointA = Vector.clone(control.target);
  updateControlGlow(side, point);
  event.preventDefault();
}

function handlePointerUp(event) {
  const side = activePointers.get(event.pointerId);

  if (!side) {
    return;
  }

  const control = controls[side];
  control.pointerId = null;
  control.startPoint = null;
  control.startTarget = null;
  control.constraint.stiffness = 0;
  control.target = Vector.clone(control.rest);
  control.constraint.pointA = Vector.clone(control.rest);
  activePointers.delete(event.pointerId);
  phone.classList.remove(`is-${side}-active`);
}

function toWorldPoint(event) {
  const rect = phone.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * WORLD_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * WORLD_HEIGHT
  };
}

function updateControlGlow(side, point) {
  const zoneWidth = WORLD_WIDTH / 2;
  const localX = side === "left" ? point.x : point.x - zoneWidth;
  const localY = point.y - HALF_HEIGHT;
  const cssX = `${clamp((localX / zoneWidth) * 100, 0, 100)}%`;
  const cssY = `${clamp((localY / HALF_HEIGHT) * 100, 0, 100)}%`;
  phone.style.setProperty(`--${side}-x`, cssX);
  phone.style.setProperty(`--${side}-y`, cssY);
}

function keepPendulumsInPlay() {
  for (const pendulum of pendulums) {
    for (const body of [pendulum.upper, pendulum.lower]) {
      if (body.position.y > HALF_HEIGHT + 90 || body.position.x < -140 || body.position.x > WORLD_WIDTH + 140) {
        Body.setPosition(body, {
          x: pendulum.anchor.x,
          y: body === pendulum.upper ? pendulum.anchor.y + LINK_LENGTH / 2 : pendulum.anchor.y + LINK_LENGTH * 1.5
        });
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      }
    }
  }
}

function drawSceneSkin() {
  drawPendulumSkin(render.context);
  drawNetSkin(render.context);
}

function drawNetSkin(context) {
  context.save();
  context.strokeStyle = "#111827";
  context.lineWidth = 2;
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let row = 0; row < NET.rows; row += 1) {
    for (let column = 0; column < NET.columns - 1; column += 1) {
      const from = net.nodes[row][column].position;
      const to = net.nodes[row][column + 1].position;

      drawStraightLine(context, from.x, from.y, to.x, to.y);
    }
  }

  for (let column = 0; column < NET.columns; column += 1) {
    for (let row = 0; row < NET.rows - 1; row += 1) {
      const from = net.nodes[row][column].position;
      const to = net.nodes[row + 1][column].position;

      drawStraightLine(context, from.x, from.y, to.x, to.y);
    }
  }

  context.strokeStyle = "#b00000";
  context.lineWidth = 3;
  drawNetBorder(context);

  context.restore();
}

function drawNetBorder(context) {
  for (let column = 0; column < NET.columns - 1; column += 1) {
    drawNodeSegment(context, net.nodes[0][column], net.nodes[0][column + 1]);
  }

  for (let row = 0; row < NET.rows - 1; row += 1) {
    drawNodeSegment(context, net.nodes[row][0], net.nodes[row + 1][0]);
    drawNodeSegment(context, net.nodes[row][NET.columns - 1], net.nodes[row + 1][NET.columns - 1]);
  }
}

function drawNodeSegment(context, fromNode, toNode) {
  const from = fromNode.position;
  const to = toNode.position;

  drawStraightLine(context, from.x, from.y, to.x, to.y);
}

function drawStraightLine(context, fromX, fromY, toX, toY) {
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
}

function drawPendulumSkin(context) {
  context.save();

  for (const pendulum of pendulums) {
    const shoulder = pendulum.anchor;
    const upperTop = localToWorld(pendulum.upper, { x: 0, y: -LINK_LENGTH / 2 });
    const upperBottom = localToWorld(pendulum.upper, { x: 0, y: LINK_LENGTH / 2 });
    const lowerTop = localToWorld(pendulum.lower, { x: 0, y: -LINK_LENGTH / 2 });
    const kneeMid = Vector.mult(Vector.add(localToWorld(pendulum.upper, { x: 0, y: LINK_LENGTH / 2 }), lowerTop), 0.5);
    const foot = localToWorld(pendulum.lower, { x: 0, y: LINK_LENGTH / 2 });

    drawLink(context, upperTop, upperBottom);
    drawLink(context, lowerTop, foot);
    drawCap(context, shoulder.x, shoulder.y, 18, 6);
    drawCap(context, kneeMid.x, kneeMid.y, 13, 10);
    drawCap(context, foot.x, foot.y, 10, 6);
  }

  context.restore();
}

function drawLink(context, from, to) {
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.lineWidth = LINK_WIDTH + 4;
  context.strokeStyle = "#111827";
  context.stroke();

  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.lineWidth = LINK_WIDTH;
  context.strokeStyle = "#ffffff";
  context.stroke();
}

function drawCap(context, x, y, width, height) {
  context.lineWidth = 2;
  context.strokeStyle = "#111827";
  context.fillStyle = "#f8fafc";
  context.beginPath();
  context.roundRect(x - width / 2, y - height / 2, width, height, 2);
  context.fill();
  context.stroke();
}

function localToWorld(body, point) {
  return Vector.add(body.position, Vector.rotate(point, body.angle));
}

function updatePixelRatio() {
  render.options.pixelRatio = window.devicePixelRatio || 1;
  Render.setPixelRatio(render, render.options.pixelRatio);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
