const steem = require("steem");
const fetch = require("node-fetch");
const md5 = require("md5");
const KEYS = require("./keys.json");

class Battle {
  constructor(callback, appName = "smitopbot-public/1.0.0", matchType = "Ranked") {
    this.callback = callback;
    this.status = {};
    this.submittedTeam = false;
    //broadcast sm_find_match
    steem.broadcast.customJson(KEYS.posting, [], [KEYS.username], "sm_find_match", JSON.stringify({
      match_type: matchType,
      app: appName
    }), (err, result) => {
      if (err) throw err;
      console.log("Broadcasted sm_find_match");
      this.findMatchId = result.id;
    });
    //start /battle/status check loop
    this._checkInterval = setInterval(() => {
      this._checkBattleStatus();
    }, 2500);
    //
  }
  end() {
    this.ended = true;
    clearInterval(this._checkInterval);
    delete this;
  }
  setTeam(team) {
    this.team = team;
  }
  broadcastTeam(summoner, monsters, skipReveal = false) {
    const secret = Battle.generatePassword();
    const teamHash = md5(summoner + "," + monsters.join() + "," + secret)
    const team = {summoner, monsters, secret};

    this.submittedTeam = true;
    var data = {
      trx_id: this.findMatchId,
      team_hash: teamHash,
      app: this.appName
    };
    if (skipReveal) {
      data.summoner = summoner;
      data.monsters = monsters;
      data.secret = secret;
    }
    steem.broadcast.customJson(KEYS.posting, [], [KEYS.username], "sm_submit_team", JSON.stringify(data), async (err, result) => {
      if (err) throw err;
      console.log("Broadcasted sm_submit_team");
      this.findMatchId = result.id;
      if (!skipReveal) {
        await new Promise(resolve => setTimeout(resolve, 3300));
        console.log("Revealing team...");
        steem.broadcast.customJson(KEYS.posting, [], [KEYS.username], "sm_team_reveal", JSON.stringify({
          ...data,
          summoner: summoner,
          monsters: monsters,
          secret: secret
        }), (err, result) => {
          console.log("Revealed team!");
        });
      }
    });
  }
  _revealTeam() {

  }
  async _checkBattleStatus() {
    if (!this.findMatchId) return;
    const rawResponse = await fetch("https://api.steemmonsters.io/battle/status?id=" + this.findMatchId);
    const json = await rawResponse.json();
    this.status.data = json;

    if ((typeof json) === "string") {
      console.log(json);
      this.status.statusName = "battleTxProcessing";
      this.callback(this.status);
      return;
    }

    if (json.error) {
      this.status.statusName = "error";
    } else if (json.status === 0) {
      this.status.statusName = "searchingForEnemy";
    } else if (json.status === 1) {
      this.status.statusName = "enemyFound";
    } else if (json.status === 3) {
      this.status.statusName = "noEnemyFound";
    }
    this.callback(this.status);
  }
  _checkBattleTrxStatus() {

  }
  static generatePassword(length = 10) {
    var charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    retVal = "";
    for (var i = 0, n = charset.length; i < length; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
  }
}

async function main() {
  let curBlock = -1;
  steem.api.streamBlockNumber((err, b) => curBlock = b);
  let ourCollection = (await getSMJson("/cards/collection/" + KEYS.username)).cards;
  setInterval(async () => { ourCollection = (await getSMJson("/cards/collection/" + KEYS.username)).cards; scanCollection(); }, 1200000);
  function scanCollection() {
    ourCollection = ourCollection.filter(card => canPlayCard(card));
  }
  scanCollection();
  setInterval(() => scanCollection(), 25000);
  function bestCard(id) {
    return ourCollection.filter(card => (card.card_detail_id === id))
      .map(card => ({...card, rarity: cardData.filter(cardD => card.card_detail_id === cardD.id)[0].rarity}))
      .sort((a, b) => { console.log(a,b); return cardBcx(a.xp, a.rarity, a.edition, a.gold) - cardBcx(b.xp, b.rarity, b.edition, b.gold) }).reverse()[0];
  }
  var submittedTeam = false;
  const battle = new Battle(async status => {
    if (!submittedTeam && (status.statusName === "enemyFound")) {
      battle.broadcastTeam(bestCard(27), []);
      submittedTeam = true;
    }
  });
}
main();
