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

Composite.add(engine.world, [
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

Events.on(render, "afterRender", drawPendulumSkin);
Events.on(engine, "afterUpdate", keepPendulumsInPlay);

function createPendulum({ side, x, y, tilt }) {
  const group = Body.nextGroup(true);
  const linkOptions = {
    collisionFilter: { group },
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

function drawPendulumSkin() {
  const context = render.context;

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
