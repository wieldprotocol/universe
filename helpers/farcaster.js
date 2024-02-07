const {
  Messages,
  Casts,
  Reactions,
  Signers,
  Verifications,
  UserData,
  Fids,
  Fnames,
  Links,
  UserDataType,
  ReactionType,
  Notifications,
  MessageType,
  Listings,
  Storage,
  Frames
} = require("../models/farcaster"), mongoose = require("mongoose"), Score = require("../models/Score")["Score"], _AlchemyService = require("../services/AlchemyService")["Service"], {
  config,
  prod
} = require("../helpers/registrar"), getHexTokenIdFromLabel = require("../helpers/get-token-id-from-label")["getHexTokenIdFromLabel"], ethers = require("ethers")["ethers"], {
  getMemcachedClient,
  getHash
} = require("../connectmemcached"), {
  Message,
  fromFarcasterTime
} = require("@farcaster/hub-nodejs");

function farcasterTimeToDate(e) {
  if (void 0 !== e) {
    if (null === e) return null;
    e = fromFarcasterTime(e);
    if (e.isErr()) throw e.error;
    return new Date(e.value);
  }
}

function bytesToHex(e) {
  if (void 0 !== e) return null === e ? null : "0x" + Buffer.from(e).toString("hex");
}

const postMessage = async ({
  isExternal: a = !1,
  externalFid: r,
  messageJSON: s,
  hubClient: i,
  errorHandler: t = e => console.error(e),
  bodyOverrides: n
}) => {
  try {
    let e = a, t = Message.fromJSON(s);
    var l, c;
    if (!e && [ MessageType.MESSAGE_TYPE_CAST_ADD, MessageType.MESSAGE_TYPE_CAST_REMOVE ].includes(t.type) && (t.data.type == MessageType.MESSAGE_TYPE_CAST_ADD && t.data.castAddBody.parentCastId ? (l = await Casts.findOne({
      hash: bytesToHex(t.data.castAddBody.parentCastId.hash)
    }), e = l?.external || e) : t.data.type == MessageType.MESSAGE_TYPE_CAST_REMOVE && (c = await Casts.findOne({
      hash: bytesToHex(t.data.castRemoveBody.targetHash)
    }), e = c?.external || e)), e && t.data.type === MessageType.MESSAGE_TYPE_USER_DATA_ADD && t.data.userDataBody.type === UserDataType.USER_DATA_TYPE_USERNAME) {
      var o = new _AlchemyService({
        apiKey: prod().NODE_URL,
        chain: prod().NODE_NETWORK
      }), d = new _AlchemyService({
        apiKey: prod().OPTIMISM_NODE_URL,
        chain: prod().OPTIMISM_NODE_NETWORK
      }), g = Buffer.from(t.data.userDataBody.value).toString("ascii").replace(".beb", "").replace(".cast", ""), u = getHexTokenIdFromLabel(g), [ y, f ] = await Promise.all([ o.getNFTs({
        owner: r,
        contractAddresses: [ prod().REGISTRAR_ADDRESS ]
      }), d.getNFTs({
        owner: r,
        contractAddresses: [ prod().OPTIMISM_REGISTRAR_ADDRESS ]
      }) ]), m = (y?.ownedNfts || []).concat(f?.ownedNfts || []).map(e => e.id?.tokenId).filter(e => e);
      if (!m.includes(u)) {
        var h = `Invalid UserData for external user, could not find ${g}/${u} in validPasses=` + m;
        if ("production" === process.env.NODE_ENV) throw new Error(h);
        console.log(h);
      }
    }
    if (!e) {
      var F = await i.submitMessage(t), p = F.unwrapOr(null);
      if (!p) throw new Error("Could not send message: " + F?.error);
      t = {
        ...p,
        hash: p.hash,
        signer: p.signer
      };
    }
    var A = new Date(), w = {
      fid: e ? r : t.data.fid,
      createdAt: A,
      updatedAt: A,
      messageType: t.data.type,
      timestamp: farcasterTimeToDate(t.data.timestamp),
      hash: bytesToHex(t.hash),
      hashScheme: t.hashScheme,
      signature: bytesToHex(t.signature),
      signatureScheme: t.signatureScheme,
      signer: bytesToHex(t.signer),
      raw: bytesToHex(Message.encode(t).finish()),
      external: e,
      unindexed: !0,
      bodyOverrides: n
    };
    try {
      await Messages.create(w);
    } catch (e) {
      if (11e3 !== (e?.code || 0)) throw e;
      console.error("Message with this hash already exists, skipping!");
    }
    return {
      result: w,
      source: "v2"
    };
  } catch (e) {
    throw t(e), e;
  }
}, GLOBAL_SCORE_THRESHOLD = 100, GLOBAL_SCORE_THRESHOLD_CHANNEL = 5, getFarcasterUserByFid = async e => {
  var t = getMemcachedClient();
  try {
    var a = await t.get("getFarcasterUserByFid:" + e);
    if (a) return JSON.parse(a.value);
  } catch (e) {
    console.error(e);
  }
  if (!e) return null;
  var [ a, r, s, i ] = await Promise.all([ Links.countDocuments({
    fid: e,
    type: "follow",
    deletedAt: null
  }), Links.countDocuments({
    targetFid: e,
    type: "follow",
    deletedAt: null
  }), UserData.find({
    fid: e,
    deletedAt: null
  }).sort({
    createdAt: 1
  }), Fids.findOne({
    fid: e,
    deletedAt: null
  }) ]), n = {
    fid: e,
    followingCount: a,
    followerCount: r,
    pfp: {
      url: "",
      verified: !1
    },
    bio: {
      text: "",
      mentions: []
    },
    external: !1,
    custodyAddress: i?.custodyAddress
  };
  let l = i?.timestamp;
  var c = {};
  for (const y of s) {
    y.external && (n.external = !0), l = l || y.createdAt, y.createdAt < l && (l = y.createdAt);
    var o = y.value.startsWith("0x") ? y.value.slice(2) : y.value, d = Buffer.from(o, "hex").toString("utf8");
    switch (y.type) {
     case UserDataType.USER_DATA_TYPE_USERNAME:
      c.username || (n.username = d, c.username = !0);
      break;

     case UserDataType.USER_DATA_TYPE_DISPLAY:
      c.displayName || (n.displayName = d, c.displayName = !0);
      break;

     case UserDataType.USER_DATA_TYPE_PFP:
      c.pfp || (n.pfp.url = d, c.pfp = !0);
      break;

     case UserDataType.USER_DATA_TYPE_BIO:
      if (!c.bio) {
        n.bio.text = d;
        for (var g, u = /(?<!\]\()@([a-zA-Z0-9_\-]+(\.[a-z]{2,})*)/g; g = u.exec(d); ) n.bio.mentions.push(g[1]);
        c.bio = !0;
      }
      break;

     case UserDataType.USER_DATA_TYPE_URL:
      c.url || (n.url = d, c.url = !0);
    }
  }
  n.registeredAt = l?.getTime();
  try {
    await t.set("getFarcasterUserByFid:" + e, JSON.stringify(n));
  } catch (e) {
    console.error(e);
  }
  return n;
}, getFarcasterUserAndLinksByFid = async ({
  fid: e,
  context: t
}) => {
  var a = await getFarcasterUserByFid(e);
  if (!t.fid || e === t.fid) return a;
  if (!a) return null;
  var r = getMemcachedClient();
  let s;
  try {
    var i = await r.get(`getFarcasterUserAndLinksByFid_${t.fid}:` + e);
    i && (s = JSON.parse(i.value));
  } catch (e) {
    console.error(e);
  }
  if (!s) {
    var [ i, n ] = await Promise.all([ Links.exists({
      fid: t.fid,
      targetFid: e,
      type: "follow",
      deletedAt: null
    }), Links.exists({
      fid: e,
      targetFid: t.fid,
      type: "follow",
      deletedAt: null
    }) ]);
    s = {
      isFollowing: i,
      isFollowedBy: n
    };
    try {
      await r.set(`getFarcasterUserAndLinksByFid_${t.fid}:` + e, JSON.stringify(s));
    } catch (e) {
      console.error(e);
    }
  }
  return {
    ...a,
    ...s
  };
}, getFarcasterUserByCustodyAddress = async e => {
  return (e = e && await Fids.findOne({
    custodyAddress: e,
    deletedAt: null
  })) ? getFarcasterUserByFid(e.fid) : null;
}, getFarcasterFidByCustodyAddress = async e => {
  if (!e) return null;
  var t = getMemcachedClient();
  try {
    var a = await t.get("getFarcasterFidByCustodyAddress:" + e);
    if (a) return a.value;
  } catch (e) {
    console.error(e);
  }
  return (await Fids.findOne({
    custodyAddress: e,
    deletedAt: null
  }))?.fid || null;
}, getFarcasterUserByConnectedAddress = async e => {
  var t = getMemcachedClient();
  let a;
  try {
    var r = await t.get("getFarcasterUserByConnectedAddress_fid:" + e);
    r && (a = r.value);
  } catch (e) {
    console.error(e);
  }
  if (!a) {
    r = '^\\{"address":"' + e.toLowerCase() + '"', r = await Verifications.findOne({
      claim: {
        $regex: r
      },
      deletedAt: null
    });
    if (!r) return null;
    a = r.fid;
  }
  try {
    await t.set("getFarcasterUserByConnectedAddress_fid:" + e, a);
  } catch (e) {
    console.error(e);
  }
  return getFarcasterUserByFid(a);
}, getConnectedAddressForFid = async e => {
  if (!e) return null;
  var t = getMemcachedClient();
  try {
    var a = await t.get("getConnectedAddressForFid:" + e);
    if (a) return a.value;
  } catch (e) {
    console.error(e);
  }
  a = await Verifications.findOne({
    fid: e,
    deletedAt: null
  });
  if (!a) return null;
  a = JSON.parse(a.claim);
  try {
    await t.set("getConnectedAddressForFid:" + e, a.address.toLowerCase());
  } catch (e) {
    console.error(e);
  }
  return a.address;
}, getCustodyAddressByFid = async e => {
  if (!e) return null;
  var t = getMemcachedClient();
  try {
    const a = await t.get("getCustodyAddressByFid:" + e);
    if (a) return a.value;
  } catch (e) {
    console.error(e);
  }
  const a = await Fids.findOne({
    fid: e,
    deletedAt: null
  });
  if (!a) return null;
  try {
    await t.set("getCustodyAddressByFid:" + e, a.custodyAddress);
  } catch (e) {
    console.error(e);
  }
  return a.custodyAddress;
}, getFidByCustodyAddress = async e => {
  if (!e) return null;
  var t = getMemcachedClient();
  try {
    var a = await t.get("getFidByCustodyAddress:" + e);
    if (a) return a.value;
  } catch (e) {
    console.error(e);
  }
  a = await Fids.findOne({
    custodyAddress: e,
    deletedAt: null
  });
  if (!a) return null;
  try {
    await t.set("getFidByCustodyAddress:" + e, a.fid);
  } catch (e) {
    console.error(e);
  }
  return a.fid;
}, searchFarcasterUserByMatch = async (e, t = 10, a = "value", r = !0) => {
  if (!e) return [];
  var s = "0x" + Buffer.from(e.toLowerCase(), "ascii").toString("hex");
  let i = "searchFarcasterUserByMatch:" + e;
  r || (i += ":noExternal");
  var n = getMemcachedClient();
  try {
    var l = await n.get(getHash(i));
    if (l) return JSON.parse(l.value);
  } catch (e) {
    console.error(e);
  }
  l = {
    $or: [ {
      value: {
        $regex: "^" + s
      },
      type: UserDataType.USER_DATA_TYPE_USERNAME,
      deletedAt: null
    }, {
      value: {
        $regex: "^" + s
      },
      type: UserDataType.USER_DATA_TYPE_DISPLAY,
      deletedAt: null
    }, {
      fid: "" + e,
      deletedAt: null
    } ]
  }, r || (l.external = !1), s = await UserData.find(l).limit(t).sort(a);
  const c = {};
  e = s.map(e => c[e.fid] ? null : (c[e.fid] = !0, e.fid)).filter(e => null !== e), 
  r = await Promise.all(e.map(e => getFarcasterUserByFid(e)));
  try {
    await n.set(getHash(i), JSON.stringify(r), {
      lifetime: 3600
    });
  } catch (e) {
    console.error(e);
  }
  return r;
}, getFarcasterUserByUsername = async (e, t = 0) => {
  var a = "0x" + Buffer.from(e, "ascii").toString("hex");
  let r;
  var s = getMemcachedClient();
  try {
    var i = await s.get("getFarcasterUserByUsername_fid:" + e);
    i && (r = i.value);
  } catch (e) {
    console.error(e);
  }
  if (r || (i = await UserData.findOne({
    value: a,
    type: UserDataType.USER_DATA_TYPE_USERNAME,
    deletedAt: null
  }), r = i?.fid), r) {
    try {
      await s.set("getFarcasterUserByUsername_fid:" + e, r);
    } catch (e) {
      console.error(e);
    }
    return getFarcasterUserByFid(r);
  }
  return null;
}, getFarcasterUserAndLinksByUsername = async ({
  username: e,
  context: t
}) => {
  var a = "0x" + Buffer.from(e, "ascii").toString("hex");
  let r;
  var s = getMemcachedClient();
  try {
    var i = await s.get(getHash("getFarcasterUserAndLinksByUsername_fid:" + e));
    i && (r = i.value);
  } catch (e) {
    console.error(e);
  }
  if (r || (i = await UserData.findOne({
    value: a,
    type: UserDataType.USER_DATA_TYPE_USERNAME,
    deletedAt: null
  }), r = i?.fid), r) {
    try {
      await s.set(getHash("getFarcasterUserAndLinksByUsername_fid:" + e), r);
    } catch (e) {
      console.error(e);
    }
    return getFarcasterUserAndLinksByFid({
      fid: r,
      context: t
    });
  }
  return null;
}, getFarcasterCastByHash = async (e, t = {}) => {
  var a = getMemcachedClient();
  let r, s;
  if (t.fid) {
    try {
      const w = await a.get(`getFarcasterCastByHash_${t.fid}:` + e);
      w && (r = JSON.parse(w.value));
    } catch (e) {
      console.error(e);
    }
    if (!r) {
      if (!(s = await Casts.findOne({
        hash: e,
        deletedAt: null
      }))) return null;
      var [ i, n ] = await Promise.all([ Reactions.exists({
        targetHash: s.hash,
        fid: t.fid,
        reactionType: ReactionType.REACTION_TYPE_LIKE,
        deletedAt: null
      }), Reactions.exists({
        targetHash: s.hash,
        fid: t.fid,
        reactionType: ReactionType.REACTION_TYPE_RECAST,
        deletedAt: null
      }) ]);
      r = {
        isSelfLike: i,
        isSelfRecast: n
      };
      try {
        await a.set(`getFarcasterCastByHash_${t.fid}:` + e, JSON.stringify(r));
      } catch (e) {
        console.error(e);
      }
    }
  }
  try {
    const w = await a.get("getFarcasterCastByHash:" + e);
    if (w) return (l = JSON.parse(w.value)).author && (l.author = await getFarcasterUserAndLinksByFid({
      fid: l.author.fid,
      context: t
    })), {
      ...l,
      ...r
    };
  } catch (e) {
    console.error(e);
  }
  if (!(s = s || await Casts.findOne({
    hash: e,
    deletedAt: null
  }))) return null;
  var [ i, n, l, t, c, o ] = await Promise.all([ Casts.countDocuments({
    parentHash: s.hash,
    deletedAt: null
  }), Reactions.countDistinct({
    targetHash: s.hash,
    reactionType: ReactionType.REACTION_TYPE_LIKE,
    deletedAt: null
  }), Reactions.countDistinct({
    targetHash: s.hash,
    reactionType: ReactionType.REACTION_TYPE_RECAST,
    deletedAt: null
  }), getFarcasterUserByFid(s.parentFid), getFarcasterUserAndLinksByFid({
    fid: s.fid,
    context: t
  }), Reactions.find({
    targetHash: s.hash,
    reactionType: ReactionType.REACTION_TYPE_RECAST,
    deletedAt: null
  }).select("fid") ]), d = s.mentions.map(e => getFarcasterUserByFid(e)), o = o.map(e => getFarcasterUserByFid(e.fid)), [ g, d ] = await Promise.all([ Promise.all(d), Promise.all(o) ]), o = s.text;
  let u = 0;
  var y, f, m, h, F, p = [];
  let A = Buffer.from(o, "utf-8");
  for (let e = 0; e < g.length; e++) g[e] && (m = s.mentionsPositions[e], y = g[e].username || "fid:" + g[e].fid, 
  y = Buffer.from("@" + y, "utf-8"), f = g[e].originalMention || "", f = Buffer.from(f, "utf-8").length, 
  m = m + u, h = A.slice(0, m), F = A.slice(m + f), A = Buffer.concat([ h, y, F ]), 
  u += y.length - f, p.push(m));
  o = A.toString("utf-8");
  const w = {
    hash: s.hash,
    parentHash: s.parentHash,
    parentFid: s.parentFid,
    parentUrl: s.parentUrl,
    threadHash: s.threadHash,
    text: o,
    embeds: JSON.parse(s.embeds),
    mentions: g,
    mentionsPositions: p,
    external: s.external,
    author: c,
    parentAuthor: t,
    timestamp: s.timestamp.getTime(),
    replies: {
      count: i
    },
    reactions: {
      count: n
    },
    recasts: {
      count: l,
      recasters: d
    },
    deletedAt: s.deletedAt
  };
  try {
    await a.set("getFarcasterCastByHash:" + e, JSON.stringify(w));
  } catch (e) {
    console.error(e);
  }
  return {
    ...w,
    ...r
  };
}, getFarcasterFeedCastByHash = async (e, t = {}) => {
  e = await getFarcasterCastByHash(e, t);
  return e?.threadHash ? {
    ...await getFarcasterCastByHash(e.threadHash, t),
    childCast: e,
    childrenCasts: [ e ]
  } : null;
}, getFarcasterCastByShortHash = async (e, t, a = {}) => {
  t = await getFarcasterUserByUsername(t);
  if (!t) return null;
  var r = getMemcachedClient();
  let s;
  try {
    var i = await r.get("getFarcasterCastByShortHash:" + e);
    i && (s = i.value);
  } catch (e) {
    console.error(e);
  }
  if (!s) {
    r = await Casts.findOne({
      hash: {
        $regex: "^" + e
      },
      fid: t.fid,
      deletedAt: null
    });
    if (!r) return null;
    s = r.hash;
  }
  return getFarcasterCastByHash(s, a);
}, getFarcasterAllCastsInThread = async (e, t) => {
  var a = getMemcachedClient();
  let r;
  try {
    var s = await a.get("getFarcasterAllCastsInThread:" + e);
    s && (r = JSON.parse(s.value).map(e => new Casts(e)));
  } catch (e) {
    console.error(e);
  }
  if (!r) {
    r = await Casts.find({
      threadHash: e,
      deletedAt: null
    }).sort({
      timestamp: 1
    });
    try {
      await a.set("getFarcasterAllCastsInThread:" + e, JSON.stringify(r));
    } catch (e) {
      console.error(e);
    }
  }
  s = await Promise.all(r.map(e => getFarcasterCastByHash(e.hash, t)));
  return [ await getFarcasterCastByHash(e, t), ...s ];
}, getFarcasterCasts = async ({
  fid: e,
  parentChain: t,
  limit: a,
  cursor: r,
  context: s,
  explore: i = !1,
  filters: n = {}
}) => {
  var [ l, c ] = r ? r.split("-") : [ null, null ], o = getMemcachedClient(), d = {
    timestamp: {
      $lt: l || Date.now()
    },
    id: {
      $lt: c || Number.MAX_SAFE_INTEGER
    },
    deletedAt: null
  };
  n?.noReplies ? d.parentHash = null : n?.repliesOnly && (d.parentHash = {
    $ne: null
  }), e ? d.fid = e : t && (d.parentUrl = t, i) && (d.globalScore = {
    $gt: GLOBAL_SCORE_THRESHOLD_CHANNEL
  });
  let g;
  if (r) try {
    var u = await o.get(`getFarcasterCasts:${e}:${t}:${a}:${r}:` + i);
    u && (g = JSON.parse(u.value).map(e => new Casts(e)));
  } catch (e) {
    console.error(e);
  }
  if (n?.type && (u = {
    timestamp: {
      $lt: l ? new Date(l) : new Date()
    },
    type: n.type,
    deletedAt: null
  }, c && (u._id = {
    $lt: mongoose.Types.ObjectI(c)
  }), l = await Casts.aggregate([ {
    $match: u
  }, {
    $group: {
      _id: "$embeds",
      allData: {
        $first: "$$ROOT"
      }
    }
  }, {
    $project: {
      _id: 0,
      uniqueEmbed: "$_id",
      castData: "$allData"
    }
  }, {
    $sort: {
      "castData.timestamp": -1
    }
  }, {
    $limit: a
  } ]), g = l.map(e => new Casts(e.castData))), !g && (g = await Casts.find(d).sort({
    timestamp: -1
  }).limit(a), r)) try {
    await o.set(`getFarcasterCasts:${e}:${t}:${a}:${r}:` + i, JSON.stringify(g));
  } catch (e) {
    console.error(e);
  }
  n = g.map(e => getFarcasterCastByHash(e.hash, s)), c = (await Promise.all(n)).filter(e => e), 
  u = c.map(e => {
    return e.parentHash ? getFarcasterCastByHash(e.parentHash, s) : e;
  });
  const y = await Promise.all(u);
  let f = null;
  return [ c.map((e, t) => e.parentHash && y[t] ? {
    ...y[t],
    childCast: e,
    childrenCasts: [ e ]
  } : e), f = g.length === a ? g[g.length - 1].timestamp.getTime() + "-" + g[g.length - 1].id : f ];
}, getFarcasterFollowing = async (e, t, a) => {
  var [ r, s ] = a ? a.split("-") : [ null, null ], i = getMemcachedClient();
  let n;
  if (a) try {
    var l = await i.get(`getFarcasterFollowing:${e}:${t}:` + a);
    l && (n = JSON.parse(l.value).map(e => new Links(e)));
  } catch (e) {
    console.error(e);
  }
  if (!n && (n = await Links.find({
    fid: e,
    type: "follow",
    timestamp: {
      $lt: r || Date.now()
    },
    id: {
      $lt: s || Number.MAX_SAFE_INTEGER
    },
    deletedAt: null
  }).sort({
    timestamp: -1
  }).limit(t), a)) try {
    await i.set(`getFarcasterFollowing:${e}:${t}:` + a, JSON.stringify(n));
  } catch (e) {
    console.error(e);
  }
  l = n.map(e => getFarcasterUserByFid(e.targetFid));
  let c = null;
  return [ await Promise.all(l), c = n.length === t ? n[n.length - 1].timestamp.getTime() + "-" + n[n.length - 1].id : c ];
}, getFarcasterFollowers = async (e, t, a) => {
  var [ r, s ] = a ? a.split("-") : [ null, null ], i = getMemcachedClient();
  let n;
  if (a) try {
    var l = await i.get(`getFarcasterFollowers:${e}:${t}:` + a);
    l && (n = JSON.parse(l.value).map(e => new Links(e)));
  } catch (e) {
    console.error(e);
  }
  if (!n && (n = await Links.find({
    targetFid: e,
    type: "follow",
    timestamp: {
      $lt: r || Date.now()
    },
    id: {
      $lt: s || Number.MAX_SAFE_INTEGER
    },
    deletedAt: null
  }).sort({
    timestamp: -1
  }).limit(t), a)) try {
    await i.set(`getFarcasterFollowers:${e}:${t}:` + a, JSON.stringify(n));
  } catch (e) {
    console.error(e);
  }
  l = n.map(e => getFarcasterUserByFid(e.fid));
  let c = null;
  return [ await Promise.all(l), c = n.length === t ? n[n.length - 1].timestamp.getTime() + "-" + n[n.length - 1].id : c ];
}, getFarcasterCastReactions = async (e, t, a) => {
  var r = getMemcachedClient(), [ s, i ] = a ? a.split("-") : [ null, null ];
  let n;
  if (a) try {
    var l = await r.get(`getFarcasterCastReactions:${e}:${t}:` + a);
    l && (n = JSON.parse(l.value).map(e => new Reactions(e)));
  } catch (e) {
    console.error(e);
  }
  if (!n && (n = await Reactions.find({
    targetHash: e,
    timestamp: {
      $lt: s || Date.now()
    },
    id: {
      $lt: i || Number.MAX_SAFE_INTEGER
    },
    deletedAt: null
  }).sort({
    timestamp: -1
  }).limit(t), a)) try {
    await r.set(`getFarcasterCastReactions:${e}:${t}:` + a, JSON.stringify(n));
  } catch (e) {
    console.error(e);
  }
  l = n.map(e => getFarcasterUserByFid(e.fid));
  let c = null;
  return [ await Promise.all(l), c = n.length === t ? n[n.length - 1].timestamp.getTime() + "-" + n[n.length - 1].id : c ];
}, getFarcasterCastLikes = async (e, t, a) => {
  var [ r, s ] = a ? a.split("-") : [ null, null ], i = getMemcachedClient();
  let n;
  if (a) try {
    var l = await i.get(`getFarcasterCastLikes:${e}:${t}:` + a);
    l && (n = JSON.parse(l.value).map(e => new Reactions(e)));
  } catch (e) {
    console.error(e);
  }
  if (!n && (n = await Reactions.find({
    targetHash: e,
    reactionType: ReactionType.REACTION_TYPE_LIKE,
    id: {
      $lt: s || Number.MAX_SAFE_INTEGER
    },
    timestamp: {
      $lt: r || Date.now()
    },
    deletedAt: null
  }).sort({
    timestamp: -1
  }).limit(t), a)) try {
    await i.set(`getFarcasterCastLikes:${e}:${t}:` + a, JSON.stringify(n));
  } catch (e) {
    console.error(e);
  }
  l = n.map(e => getFarcasterUserByFid(e.fid));
  let c = null;
  return [ await Promise.all(l), c = n.length === t ? n[n.length - 1].timestamp.getTime() + "-" + n[n.length - 1].id : c ];
}, getFarcasterCastRecasters = async (e, t, a) => {
  var [ r, s ] = a ? a.split("-") : [ null, null ], i = getMemcachedClient();
  let n;
  if (a) try {
    var l = await i.get(`getFarcasterCastRecasters:${e}:${t}:` + a);
    l && (n = JSON.parse(l.value).map(e => new Reactions(e)));
  } catch (e) {
    console.error(e);
  }
  if (!n && (n = await Reactions.find({
    targetHash: e,
    reactionType: ReactionType.REACTION_TYPE_RECAST,
    id: {
      $lt: s || Number.MAX_SAFE_INTEGER
    },
    timestamp: {
      $lt: r || Date.now()
    },
    deletedAt: null
  }).limit(t), a)) try {
    await i.set(`getFarcasterCastRecasters:${e}:${t}:` + a, JSON.stringify(n));
  } catch (e) {
    console.error(e);
  }
  l = n.map(e => getFarcasterUserByFid(e.fid));
  let c = null;
  return [ await Promise.all(l), c = n.length === t ? n[n.length - 1].timestamp.getTime() + "-" + n[n.length - 1].id : c ];
}, getFarcasterFeed = async ({
  limit: e = 10,
  cursor: t = null,
  context: a = {},
  explore: r = !1
}) => {
  var s = getMemcachedClient(), [ i, n ] = t ? t.split("-") : [ null, null ], i = (Date.now(), 
  {
    timestamp: {
      $lt: i || Date.now()
    },
    id: {
      $lt: n || Number.MAX_SAFE_INTEGER
    },
    deletedAt: null
  });
  r && (i.globalScore = {
    $gt: GLOBAL_SCORE_THRESHOLD
  });
  let l;
  try {
    var c = await s.get(`getFarcasterFeed:${a?.fid || "global"}:${r}:${e}:` + t);
    c && (l = JSON.parse(c.value).map(e => new Casts(e)));
  } catch (e) {
    console.error(e);
  }
  if (!l) {
    l = await Casts.find(i).sort({
      timestamp: -1
    }).limit(e);
    try {
      t ? await s.set(`getFarcasterFeed:${a?.fid || "global"}:${r}:${e}:` + t, JSON.stringify(l)) : await s.set(`getFarcasterFeed:${a?.fid || "global"}:${r}:${e}:` + t, JSON.stringify(l), {
        lifetime: 30
      });
    } catch (e) {
      console.error(e);
    }
  }
  n = l.map(e => getFarcasterFeedCastByHash(e.hash, a)), c = (await Promise.all(n)).filter(e => !!e);
  const o = {};
  i = c.reduce((e, t) => (t.author?.fid && (e[t.hash] || o[t.author.fid] ? o[t.author.fid] || t.childrenCasts.length > e[t.hash].childrenCasts.length && (e[t.hash] = t, 
  o[t.author.fid] = o[t.author.fid] ? o[t.author.fid] + 1 : 1) : (e[t.hash] = t, 
  o[t.author.fid] = o[t.author.fid] ? o[t.author.fid] + 1 : 1)), e), {});
  let d = null;
  return l.length === e && (d = l[l.length - 1].timestamp.getTime() + "-" + l[l.length - 1].id), 
  [ Object.values(i), d ];
}, getFarcasterUnseenNotificationsCount = async ({
  lastSeen: e,
  context: t
}) => {
  if (!t.fid) return 0;
  var a = getMemcachedClient();
  try {
    var r = await a.get("getFarcasterUnseenNotificationsCount:" + t.fid);
    if (r) return r.value;
  } catch (e) {
    console.error(e);
  }
  r = await Notifications.countDocuments({
    toFid: t.fid,
    timestamp: {
      $gt: e
    },
    deletedAt: null
  });
  try {
    await a.set("getFarcasterUnseenNotificationsCount:" + t.fid, r);
  } catch (e) {
    console.error(e);
  }
  return r;
}, getFarcasterNotifications = async ({
  limit: e,
  cursor: t,
  context: r
}) => {
  var [ a, s ] = t ? t.split("-") : [ null, null ], i = getMemcachedClient();
  let n;
  if (t) try {
    const c = await i.get(`getFarcasterNotifications:${r.fid}:${e}:` + t);
    c && (n = JSON.parse(c.value).map(e => new Notifications(e)));
  } catch (e) {
    console.error(e);
  }
  if (!n && (n = await Notifications.find({
    toFid: r.fid,
    timestamp: {
      $lt: a || Date.now()
    },
    fromFid: {
      $ne: r.fid
    },
    id: {
      $lt: s || Number.MAX_SAFE_INTEGER
    },
    deletedAt: null
  }).sort({
    timestamp: -1
  }).limit(e), t)) try {
    await i.set(`getFarcasterNotifications:${r.fid}:${e}:` + t, JSON.stringify(n));
  } catch (e) {
    console.error(e);
  }
  let l = null;
  n.length === e && (l = n[n.length - 1].timestamp.getTime() + "-" + n[n.length - 1].id);
  const c = await Promise.all(n.map(async e => {
    var t = await getFarcasterUserAndLinksByFid({
      fid: e.fromFid,
      context: r
    }), a = {}, t = ([ "reply", "mention", "reaction" ].includes(e.notificationType) && (a.cast = await getFarcasterCastByHash(e.payload.castHash, r)), 
    {
      type: e.notificationType,
      timestamp: e.timestamp.getTime(),
      actor: t,
      content: a,
      id: e.id
    });
    return "reaction" === e.notificationType && (t.reactionType = e.payload.reactionType), 
    t;
  }));
  return [ c, l ];
}, getFarcasterStorageByFid = async e => {
  var t = getMemcachedClient();
  let a;
  try {
    var r = await t.get("getFarcasterStorageByFid:" + e);
    r && (a = JSON.parse(r.value).map(e => new Storage(e)));
  } catch (e) {
    console.error(e);
  }
  if (!a) {
    a = await Storage.find({
      fid: e,
      deletedAt: null
    });
    try {
      await t.set("getFarcasterStorageByFid:" + e, JSON.stringify(a));
    } catch (e) {
      console.error(e);
    }
  }
  return a.map(e => ({
    timestamp: e.timestamp,
    fid: e.fid,
    units: e.units,
    expiry: e.expiry
  }));
}, getLeaderboard = async ({
  scoreType: e,
  limit: t,
  context: a
}) => {
  e = await Score.getLeaderboard(e, t);
  return await Promise.all(e.map(async e => {
    var t = await getFarcasterUserAndLinksByFid({
      fid: e.account.recoverers?.[0]?.id,
      context: a
    });
    return {
      ...e,
      profile: t
    };
  }));
}, makeSignatureParams = ({
  publicKey: e,
  deadline: t
}) => {
  return e && t ? {
    primaryType: "SignedKeyRequest",
    domain: {
      name: "Farcaster SignedKeyRequestValidator",
      version: "1",
      chainId: 10,
      verifyingContract: "0x00000000fc700472606ed4fa22623acf62c60553"
    },
    types: {
      SignedKeyRequest: [ {
        name: "requestFid",
        type: "uint256"
      }, {
        name: "key",
        type: "bytes"
      }, {
        name: "deadline",
        type: "uint256"
      } ]
    },
    message: {
      requestFid: ethers.BigNumber.from(config().FARCAST_FID),
      key: "0x" + e,
      deadline: ethers.BigNumber.from(t)
    }
  } : {};
}, getFidMetadataSignature = async ({
  publicKey: e,
  deadline: t
}) => {
  e = makeSignatureParams({
    publicKey: e,
    deadline: t
  });
  if (e.message) return (async e => {
    var t = config().FARCAST_KEY;
    if (t) return t = ethers.Wallet.fromMnemonic(t), e = {
      domain: e.domain,
      types: e.types,
      message: e.message,
      primaryType: e.primaryType
    }, t._signTypedData(e.domain, e.types, e.message);
    throw new Error("Mnemonic key not found in environment variables");
  })(e);
  throw new Error("Invalid signature params");
}, createFrame = async (e = {}) => {
  var t = {
    frameButton1: {
      text: e["fc:frame:button:1"],
      action: e["fc:frame:button:1:action"]
    },
    frameButton2: {
      text: e["fc:frame:button:2"],
      action: e["fc:frame:button:2:action"]
    },
    frameButton3: {
      text: e["fc:frame:button:3"],
      action: e["fc:frame:button:3:action"]
    },
    frameButton4: {
      text: e["fc:frame:button:4"],
      action: e["fc:frame:button:4:action"]
    },
    frameImageUrl: e["fc:frame:image"],
    framePostUrl: e["fc:frame:post_url"],
    image: e.image,
    title: e.title,
    sourceUrl: e.sourceUrl,
    description: e.description,
    domain: e.domain
  };
  return e.hash ? Frames.findOneAndUpdate({
    hash: e.hash
  }, {
    ...t
  }, {
    upsert: !0
  }) : Frames.create({
    ...t
  });
}, getFrame = async e => {
  return await Frames.findOne({
    hash: e
  });
};

module.exports = {
  getFarcasterUserByFid: getFarcasterUserByFid,
  getFarcasterUserByUsername: getFarcasterUserByUsername,
  getFarcasterCastByHash: getFarcasterCastByHash,
  getFarcasterAllCastsInThread: getFarcasterAllCastsInThread,
  getFarcasterCasts: getFarcasterCasts,
  getFarcasterFollowing: getFarcasterFollowing,
  getFarcasterFollowers: getFarcasterFollowers,
  getFarcasterCastReactions: getFarcasterCastReactions,
  getFarcasterCastLikes: getFarcasterCastLikes,
  getFarcasterCastRecasters: getFarcasterCastRecasters,
  getFarcasterCastByShortHash: getFarcasterCastByShortHash,
  getFarcasterFeed: getFarcasterFeed,
  getFidByCustodyAddress: getFidByCustodyAddress,
  getCustodyAddressByFid: getCustodyAddressByFid,
  getFarcasterUserByCustodyAddress: getFarcasterUserByCustodyAddress,
  getFarcasterNotifications: getFarcasterNotifications,
  getFarcasterUnseenNotificationsCount: getFarcasterUnseenNotificationsCount,
  getFarcasterUserAndLinksByFid: getFarcasterUserAndLinksByFid,
  getFarcasterUserAndLinksByUsername: getFarcasterUserAndLinksByUsername,
  getFarcasterUserByConnectedAddress: getFarcasterUserByConnectedAddress,
  getConnectedAddressForFid: getConnectedAddressForFid,
  postMessage: postMessage,
  searchFarcasterUserByMatch: searchFarcasterUserByMatch,
  GLOBAL_SCORE_THRESHOLD: GLOBAL_SCORE_THRESHOLD,
  GLOBAL_SCORE_THRESHOLD_CHANNEL: GLOBAL_SCORE_THRESHOLD_CHANNEL,
  getFarcasterFidByCustodyAddress: getFarcasterFidByCustodyAddress,
  getFarcasterStorageByFid: getFarcasterStorageByFid,
  getLeaderboard: getLeaderboard,
  getFidMetadataSignature: getFidMetadataSignature,
  createFrame: createFrame,
  getFrame: getFrame
};