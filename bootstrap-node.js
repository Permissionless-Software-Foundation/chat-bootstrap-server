"use strict";

// CUSTOMIZE THESE VARIABLES
const DB_NAME = "orbitdbchatipfs987333979"; //  main db for messages
const DB_NAME_CONTROL = "db-control9535561"; // db controller  info from private subscriptions y private channels
const IPFS = require("ipfs");
const OrbitDB = require("orbit-db");
const { encrypt, decrypt } = require("./encryption.js");
const PUBSUB_CHANNEL = "ipfsObitdb-chat";
let onlineNodes = {};
let orbitdb;
let dbControl;
//let gettingPassword = true;
let latestMessagesDecrypted = [];

// Pass the encryption password in via environment variable.
let ENCRYPTION_PASSWORD;
if (!process.env.CHAT_ENCRYPTION_PASS) {
  console.log(
    `Please set the encryption password via the CHAT_ENCRYPTION_PASS environment variable before running this app.`
  );
  return;
} else {
  ENCRYPTION_PASSWORD = process.env.CHAT_ENCRYPTION_PASS;
}

// starting ipfs node
console.log("Starting...!");
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

    // create main db , global chat  messages
    orbitdb = await OrbitDB.createInstance(ipfs, optionsDb);
    db = await orbitdb.eventlog(DB_NAME, access);
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
    //console.log(`dbControl id: ${db.id}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  // get encryption password from console
  //getPasswordEncryption()

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
        keyId: key,
        publicKey :jsonData.publicKey // public key for encrypt msg
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

// Decrypting all db_control values
const getDataDecrypted = async arrayData => {
  arrayData.map(async val => {
    let decoded = await decrypt(val.payload.value, ENCRYPTION_PASSWORD);
    latestMessagesDecrypted.push(JSON.parse(decoded));
  });
};
//Control channels  and db id's
const queryControl = async (from, to, channelName, dbName, dbID) => {
  const access = {
    accessController: {
      write: ["*"],
      overwrite: true
    }
  };
  let chatData;
  const latestMessages = dbControl.iterator({ limit: -1 }).collect();
  await getDataDecrypted(latestMessages);

  /*
   Search for an existing channel and conversation info between two nodes
   */
  for (let i = 0; i < latestMessagesDecrypted.length; i++) {
    if (latestMessagesDecrypted[i].peer1 === from) {
      if (latestMessagesDecrypted[i].peer2 === to) {
        chatData = latestMessagesDecrypted[i];
      }
    } else if (latestMessagesDecrypted[i].peer1 === to) {
      if (latestMessagesDecrypted[i].peer2 === from) {
        chatData = latestMessagesDecrypted[i];
      }
    }
  }
  latestMessagesDecrypted = []; // reset latest Messages Decrypted array

  //  channel/room betwwen 2 peer exists
  if (chatData) {
    const entry2 = {
      peer1: from, //node that emits the petition
      peer2: to, //node that receives the petition
      channelName: chatData.channelName, //name for pubsubchannel between peer1 and peer2
      dbName: chatData.dbName, //name for private Orbitdb between peer1 and peer2
      dbId: dbID, //id for replicate private Orbitdb between peer1 and peer2
      exist: true,
    };

    const msgEncoded = Buffer.from(JSON.stringify(entry2));
    ipfs.pubsub.publish(from, msgEncoded);
  //  orbitdb.eventlog(entry2.dbName, access);
    return chatData;
  }
  //   channel betwwen 2 peer not exists. Create and add room info
  try {
    const entry = {
      peer1: from, //node that emits the petition
      peer2: to, //node that receives the petition
      channelName: channelName, //name for pubsubchannel between peer1 and peer2
      dbName: dbName, //name for private Orbitdb between peer1 and peer2
      dbId: dbID, //id for replicate private Orbitdb between peer1 and peer2
      exist: false,
    };

    // orbitdb.eventlog(entry.dbName, access);

    //encrypting entry
    const entryEncrypted = await encrypt(
      JSON.stringify(entry),
      ENCRYPTION_PASSWORD
    );
    //adding to db
    await dbControl.add(entryEncrypted);
    // sending to node that emits the petition
    const msgEncoded = Buffer.from(JSON.stringify(entry));
    ipfs.pubsub.publish(from, msgEncoded);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

// old encryption
/*
const getPasswordEncryption = () => {
  // get password for encrypt- console
  var standard_input = process.openStdin();
  process.stdin.setEncoding("utf8");
  console.log("\n");
  console.log("--------------------\n");
  console.log("Insert Encryption Password.");

  //
  standard_input.on("data", async data => {
    //  console.clear();
    // User input exit.
    if (data === "exit\n") {
      // Program exit.
      console.log("User input complete, program exit.");
      process.exit();
    } else {
      if (gettingPassword) {
        ENCRYPTION_PASSWORD = data.replace(/(\r\n|\n|\r)/gm, ""); // remove /n from data
        gettingPassword = false;
        console.log("done!");
      }
    }
  });
};

// Generate password.
const generatePassword = async () => {
  let long = parseInt(Math.floor(Math.random() * 10 + 7)); //min 7 Characters
  if (long > 10) long = 10; //max 10 Characters
  let charts = "abcdefghijkmnpqrtuvwxyzABCDEFGHIJKLMNPQRTUVWXYZ2346789";
  let pass = "";
  for (let i = 0; i < long; i++)
    pass += charts.charAt(Math.floor(Math.random() * charts.length));
  return pass;
};
*/