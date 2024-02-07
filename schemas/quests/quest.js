const mongoose = require("mongoose"), contentSchema = require("../content")["schema"], keyValueFieldsSchema = require("../keyValueFields")["schema"], questRequirementSchema = mongoose.Schema({
  title: {
    type: String
  },
  type: {
    type: String,
    enum: [ "COMMUNITY_PARTICIPATION", "SCORE", "FARCASTER_ACCOUNT", "FARCASTER_FOLLOWERS_10", "FARCASTER_FOLLOWERS_100", "FARCASTER_FOLLOWERS_1000", "FARCASTER_FOLLOWERS_5000", "FARCASTER_FOLLOWERS_10000", "FARCASTER_CASTS_250", "FARCASTER_CASTS_100", "FARCASTER_CASTS_1", "FARCASTER_COMMENT_10", "FARCASTER_LIKES_10", "FARCASTER_LIKES_100", "FARCASTER_LIKES_500", "FARCASTER_FARQUEST_TAGGED", "VALID_NFT", "TOTAL_NFT", "VALID_NFT_3", "VALID_NFT_5", "SHARE", "FARMARKET_LISTING_FIRST", "FARMARKET_BUY_FIRST", "FARMARKET_OFFER_FIRST", "MULTICHOICE_SINGLE_QUIZ", "AUTO_CLAIM" ]
  },
  data: [ keyValueFieldsSchema ],
  description: contentSchema
}), questRewardsSchema = mongoose.Schema({
  title: {
    type: String
  },
  type: {
    type: String,
    enum: [ "ASSET_3D", "SCORE", "IMAGE", "NFT" ]
  },
  quantity: {
    type: Number,
    default: 1
  },
  rewardId: {
    type: mongoose.Schema.Types.ObjectId,
    index: !0
  },
  isSponsored: {
    type: Boolean,
    default: !1
  },
  category: {
    type: String
  }
}), schema = mongoose.Schema({
  description: contentSchema,
  startsAt: {
    type: Date
  },
  endsAt: {
    type: Date
  },
  title: {
    type: String
  },
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Community"
  },
  schedule: {
    type: String,
    enum: [ "ONCE", "DAILY", "WEEKLY", "MONTHLY" ]
  },
  imageUrl: {
    type: String
  },
  requirementJoinOperator: {
    type: String,
    enum: [ "AND", "OR" ],
    default: "OR"
  },
  requirements: [ questRequirementSchema ],
  rewards: [ questRewardsSchema ]
}, {
  timestamps: !0
});

schema.index({
  community: 1
}), module.exports = {
  schema: schema,
  questRequirementSchema: questRequirementSchema,
  questRewardsSchema: questRewardsSchema
};