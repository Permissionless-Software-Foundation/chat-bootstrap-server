"use strict";

// CUSTOMIZE THESE VARIABLES
const DB_NAME = "orbitddbchatappipfs987979"; //  main db for messages
const DB_NAME_CONTROL = "dbcontrol95687"; // db controller  info from private subscriptions y private channels
const IPFS = require("ipfs");
const OrbitDB = require("orbit-db");
const PUBSUB_CHANNEL = "ipfsObitdb-chat";
let onlineNodes = {};
let orbitdb;
let dbControl;

// starting ipfs node
console.log("Starting...");
const ipfs = new IPFS({
  repo: "./orbitdb/examples/ipfs",
  start: true,
  EXPERIMENTAL: {
    pubsub: true
  },
  // config: {
  //   Addresses: {
  //     Swarm: ["/ip4/0.0.0.0/tcp/8006", "/ip4/127.0.0.1/tcp/8007/ws"],
  //     API: "/ip4/127.0.0.1/tcp/8008",
  //     Gateway: "/ip4/127.0.0.1/tcp/8009"
  //   }
  // },
  relay: {
    enabled: true, // enable circuit relay dialer and listener
    hop: {
      enabled: true // enable circuit relay HOP (make this node a relay)
    }
  }
});

ipfs.on("error", err => console.error(err));

ipfs.on("replicated", () => {
  console.log(`replication event fired`);
});

ipfs.on("ready", async () => {
  console.log(`ipfs ready.`);

  // init orbitDb
  let db;
  const optionsDb = {
    directory: "./orbitdb/examples/eventlog"
  };

  try {
    const access = {
      accessController: {
        write: ["*"],
        overwrite: true
      }
    };

  
    // create main db 
    orbitdb = await OrbitDB.createInstance(ipfs, optionsDb);
    db = await orbitdb.eventlog(DB_NAME, access); //orbitdb.eventlog(DB_NAME, access)
    await db.load();
    console.log(`db id: ${db.id}`);

    // setInterval(async function() {
    //   const peers = await ipfs.swarm.peers()
    //   console.log(`peers: ${JSON.stringify(peers,null,2)}`)
    // }, 5000)
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  try {
    const access = {
      // Give write access to everyone
      write: ["*"]
    };
      
    /* create db for control info
    	This DB controls the information between channels of peer to peer nodes
    */
    dbControl = await orbitdb.eventlog(DB_NAME_CONTROL, access); 
    await dbControl.load();
    console.log(`dbControl id: ${db.id}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  //subscribe to master  pubsub channel
  ipfs.pubsub.subscribe(PUBSUB_CHANNEL, data => {
    const jsonData = JSON.parse(data.data.toString());
    const key = data.from.toString();

    /*
    All the nodes connected send a message each second 
    to keep control of the online nodes  
    */
    if (jsonData.status === "online" && jsonData.username != "system") {
      const userData = {
        username: jsonData.username ? jsonData.username : "",
        date: new Date(),
        keyId: key
      };
      if (onlineNodes[data.from] == undefined) {
        console.log("system", `${data.from} joined the chat`);
      }
      onlineNodes[data.from] = userData;
    }
    //Node request to generate a private channel with another node
    if (jsonData.status === "requestChat") {
      subscribe(jsonData.channelName, jsonData.dbName);
      queryControl(
        jsonData.peer1,
        jsonData.peer2,
        jsonData.channelName,
        jsonData.dbName,
        jsonData.dbId
      );
    }
  });

  // sending online nodes list in master pubsub channel
  setInterval(() => {
    const msg = { onlineNodes: onlineNodes };
    const msgEncoded = Buffer.from(JSON.stringify(msg));
    ipfs.pubsub.publish(PUBSUB_CHANNEL, msgEncoded);

    const msg2 = { status: "online", username: "system" };
    const msgEncoded2 = Buffer.from(JSON.stringify(msg2));
    ipfs.pubsub.publish(PUBSUB_CHANNEL, msgEncoded2);

    //peers subscriptions to PUBSUB_CHANNEL
    ipfs.pubsub.peers(PUBSUB_CHANNEL, (err, peerIds) => {
      if (err) {
        return console.error(
          `failed to get peers subscribed to ${PUBSUB_CHANNEL}`,
          err
        );
      }
      //console.log(peerIds)
    });
  }, 1000);

  // pull offline nodes from list
  setInterval(() => {
    const peers = Object.keys(onlineNodes);
    peers.sort().forEach((peerID, i) => {
      const timeLastSaw = onlineNodes[peerID].date;
      const diff = (new Date() - timeLastSaw) / 1500;
      if (diff > 5) {
        delete onlineNodes[peerID];
        console.log(`System ${peerID} left the chat`);
        return;
      }
    });
  }, 1000);
});

const subscribe = async (cnahhelName, dbname) => {
  ipfs.pubsub.subscribe(cnahhelName, data => {
    // console.log(data.from);
  });
};
// db query for add data to main db
const query = async (nickname, message) => {
  try {
    const entry = { nickname: nickname, message: message };
    await db.add(entry);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

// query for control channels and db id's
const queryControl = async (from, to, channelName, dbName, dbID) => {
  const access = {
    accessController: {
      write: ["*"],
      overwrite: true
    }
  };
  let chatData;
  const latestMessages = dbControl.iterator({ limit: -1 }).collect();// get all info from orbitdb
  
  /*
  Search for an existing channel and conversation between two nodes
  */
  for (let i = 0; i < latestMessages.length; i++) {
    if (latestMessages[i].payload.value.peer1 === from) {
      if (latestMessages[i].payload.value.peer2 === to) {
        chatData = latestMessages[i].payload.value;
      }
    } else if (latestMessages[i].payload.value.peer1 === to) {
      if (latestMessages[i].payload.value.peer2 === from) {
        chatData = latestMessages[i].payload.value;
      }
    }
  }
  // channel betwwen 2 peer exists
  if (chatData) {
    // info for private channels
    const entry2 = {
      peer1: from,
      peer2: to,
      channelName: chatData.channelName,
      dbName: chatData.dbName,
      dbId: dbID,
      exist: true
    };
    const msgEncoded = Buffer.from(JSON.stringify(entry2));
    ipfs.pubsub.publish(from, msgEncoded); //Sends the information to the node that makes the request
    orbitdb.eventlog(entry2.dbName, access);
    return chatData;
  }
  // channel betwwen 2 peer not exists
  try {
     // info for private channels
    const entry = {
      peer1: from,
      peer2: to,
      channelName: channelName,
      dbName: dbName,
      dbId: dbID,
      exist: false
    };
    orbitdb.eventlog(entry.dbName, access);
    //encrypt entry here
    await dbControl.add(entry);
    const msgEncoded = Buffer.from(JSON.stringify(entry));
    ipfs.pubsub.publish(from, msgEncoded);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};
