import { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.WS_PORT;
const wss = new WebSocketServer({ port: 8080 });
console.log(`Websocket server running on port ${8080}`);

// *** Lobby ***
const users = [];

const addUser = (user) => {
  if (!users.includes(user)) {
    users.push(user);
  }
};

const removeUser = (user) => {
  const i = users.indexOf(user);
  users.splice(i, 1);
};

wss.broadcast = (data) => {
  wss.clients.forEach((client) => {
    client.send(data);
  });
};

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.req === "username") {
      const userData = data.username;
      addUser(userData);
      wss.broadcast(JSON.stringify({ res: "users", users }));
    }

    if (data.req === "challenge") {
      wss.broadcast(
        JSON.stringify({ res: "challenged", challengers: data.challengers })
      );
    }

    if (data.req === "close") {
      removeUser(data.username);
      wss.broadcast(JSON.stringify({ res: "users", users }));
    }

    if (data.req === "createInstance") {
      createInstance(data.challengers.challenger, data.challengers.username);
    }
  });
});

// *** Game ***
const ports = [];

const generateId = () => {
  return Date.now().toString(32) + Math.random().toString(32);
};

const calculateDirections = (inputs, segments) => {
  let newSegments = [...segments];
  let firstSegment = newSegments[newSegments.length - 1];

  switch (inputs) {
    case "up":
      firstSegment = [firstSegment[0] - 1, firstSegment[1]];
      break;
    case "down":
      firstSegment = [firstSegment[0] + 1, firstSegment[1]];
      break;
    case "left":
      firstSegment = [firstSegment[0], firstSegment[1] - 1];
      break;
    case "right":
      firstSegment = [firstSegment[0], firstSegment[1] + 1];
      break;
  }

  newSegments.push(firstSegment);
  newSegments.shift();

  return newSegments;
};

const getRandCoord = () => {
  let x = Math.floor(Math.random() * 29);
  let y = Math.floor(Math.random() * 29);

  return [x, y];
};

let foodCoord = getRandCoord();
let segmentsChallenger = [
  [9, 9],
  [9, 8],
];
let segmentsChallenged = [
  [20, 20],
  [20, 21],
];

const checkFood = (segments, coord) => {
  const firstSegment = segments.length - 1;
  let newSegments = [...segments];
  let newFoodCoord = [...coord];
  if (
    coord[0] === newSegments[firstSegment][0] &&
    coord[1] === newSegments[firstSegment][1]
  ) {
    const growSegments = grow(newSegments);
    foodCoord = getRandCoord();
    return { newSegments: growSegments, newFoodCoord: foodCoord };
  } else {
    return { newSegments, newFoodCoord };
  }
};

const checkBorder = (segments) => {
  const newSegment = [...segments];
  const firstSegment = segments.length - 1;
  if (
    newSegment[firstSegment][0] > 29 ||
    newSegment[firstSegment][0] < 0 ||
    newSegment[firstSegment][1] > 29 ||
    newSegment[firstSegment][1] < 0
  ) {
    return true;
  } else {
    return false;
  }
};

const checkCollision = (segments) => {
  let newSegments = [...segments];
  let firstSegment = newSegments[segments.length - 1];

  const newSegmentsChallenger = [...segmentsChallenger];
  const newSegmentsChallenged = [...segmentsChallenged];
  newSegmentsChallenger.pop();
  newSegmentsChallenged.pop();

  let collision = false;

  newSegmentsChallenger.every((segment) => {
    if (firstSegment[0] === segment[0] && firstSegment[1] === segment[1]) {
      collision = true;
      return false;
    }
    return true;
  });

  if (!collision) {
    newSegmentsChallenged.every((segment) => {
      if (firstSegment[0] === segment[0] && firstSegment[1] === segment[1]) {
        collision = true;
        return false;
      }
      return true;
    });
  }

  return collision;
};

const grow = (segments) => {
  const newSegments = [...segments];
  newSegments.unshift([]);
  return newSegments;
};

const initInstance = (port) => {
  const wss = new WebSocketServer({ port });
  console.log(`Websocket server running on port ${port}`);

  wss.broadcast = (data) => {
    wss.clients.forEach((client) => {
      client.send(data);
    });
  };

  wss.on("connection", (ws) => {
    const interval = setInterval(() => {
      ws.send(JSON.stringify({ res: "inputs" }));
    }, 100);

    ws.on("message", (msg) => {
      const data = JSON.parse(msg);

      if (data.req === "init") {
        ws.send(JSON.stringify({ res: "init", foodCoord }));
      }

      if (data.req === "inputs") {
        const segments = calculateDirections(
          data.data.input,
          data.data.segments
        );

        const { newSegments, newFoodCoord } = checkFood(segments, foodCoord);
        const foodEaten = segments.length !== newSegments.length ? true : false;

        data.data.status === "challenger"
          ? (segmentsChallenger = newSegments)
          : (segmentsChallenged = newSegments);

        const gameOver =
          checkBorder(newSegments) || checkCollision(newSegments);

        wss.broadcast(
          JSON.stringify({
            res: "calculatedData",
            status: data.data.status,
            segments: newSegments,
            foodCoord: newFoodCoord,
            foodEaten,
            gameOver,
          })
        );
      }
    });
  });
};

const createInstance = (challenger, challenged) => {
  const serverId = generateId();
  const port =
    ports.length === 0
      ? (parseInt(PORT) + 1).toString()
      : (parseInt(ports[ports.length - 1]) + 1).toString();
  ports.push(port);

  const challengers = { challenger, challenged };

  wss.broadcast(
    JSON.stringify({
      res: "instanceCreated",
      serverId,
      challengers,
      port,
    })
  );

  initInstance(ports[ports.length - 1]);

  removeUser(challenger);
  removeUser(challenged);

  wss.broadcast(JSON.stringify({ res: "users", users }));
};
