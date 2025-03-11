import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

type Message = { sender: number; message: Value };

// Variables globales internes au nœud pour le consensus
let receivedMessages: Message[] = [];
let consensusState: { decided: boolean; x: Value | null; k: number } = {
  decided: false,
  x: null,
  k: 0,
};

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    res.status(isFaulty ? 500 : 200).send(isFaulty ? "faulty" : "live");
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes
  node.post("/message", (req, res) => {
    // Les messages sont stockés uniquement pour les nœuds non défectueux
    if (!isFaulty) {
      const { sender, message } = req.body;
      receivedMessages.push({ sender, message });
    }
    res.status(200).send("message received");
  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {
    if (isFaulty) {
      return res.status(200).send({ decided: null, x: null, k: null });
    }
    if (!nodesAreReady()) {
      return res.status(400).send("Nodes are not ready yet.");
    }


    receivedMessages = [];
    let round = 0;
    let currentValue: Value = initialValue;
    consensusState = { decided: false, x: currentValue, k: 0 };

    console.log(`Node ${nodeId} starting consensus with value: ${currentValue}`);

  
    while (round < F + 1 && !consensusState.decided) {
      console.log(`Node ${nodeId} - Round ${round} - Broadcasting value: ${currentValue}`);

  
      for (let i = 0; i < N; i++) {
        if (i !== nodeId) {
          try {
            await fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sender: nodeId, message: currentValue }),
            });
          } catch (error) {
            console.error(`Node ${nodeId} failed to send message to Node ${i}`, error);
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const counts: Record<string, number> = {};
      counts[currentValue] = (counts[currentValue] || 0) + 1;
      receivedMessages.forEach(({ message }) => {
        counts[message] = (counts[message] || 0) + 1;
      });
      receivedMessages = [];

      console.log(`Node ${nodeId} - Vote counts:`, counts);
      let majorityValue: Value | null = null;
      let maxCount = 0;
      for (const [value, count] of Object.entries(counts)) {
        const numericValue = Number(value) as Value;
        if (count > maxCount) {
          maxCount = count;
          majorityValue = numericValue;
        }
      }

      
      if (majorityValue !== null && maxCount > N / 2) {
        currentValue = majorityValue;
        consensusState = { decided: true, x: majorityValue, k: round };
        console.log(`Node ${nodeId} - Consensus reached with value: ${majorityValue} in round ${round}`);
        break;
      } else {
        
        if (round % 2 === 1) {
          currentValue = (Math.random() < 0.5 ? 0 : 1) as Value;
          console.log(`Node ${nodeId} - Round ${round} - Randomized value: ${currentValue}`);
        }
      }
      round++;
    }

    if (!consensusState.decided) {
      consensusState = { decided: false, x: currentValue, k: round };
    }

    res.status(200).send(consensusState);
    return;
  });

  // TODO implement this
  // this route is used to stop the consensus algorithm
  node.get("/stop", async (req, res) => {
    res.status(200).send("Consensus stopped.");
  });

  // TODO implement this
  // get the current state of a node
  node.get("/getState", (req, res) => {
    if (isFaulty) {
      res.status(200).send({ decided: null, x: null, k: null });
    } else {
      res.status(200).send(consensusState);
    }
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
