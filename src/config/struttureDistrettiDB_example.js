//esempio: messina
const distretti = {
    1: "Messina",
    3: "Taormina",
    4: "Milazzo",
    5: "Lipari",
    6: "Barcellona",
    7: "Patti",
    8: "Mistretta",
    9: "S.Agata"
}

const comuniDistretti = {
    "083027": 1, "083048": 1, "083072": 1, "083076": 1, "083094": 1, "083105": 1, "083061": 1,
    "083032": 3, "083090": 3, "083089": 3, "083097": 3, "083017": 3,
    "083049": 4, "083064": 4, "083098": 4,
    "083041": 5,
    "083005": 6, "083106": 6, "083028": 6,
    "083033": 7, "083007": 7, "083066": 7, "083095": 7,
    "083052": 8, "083091": 8,
    "083001": 9, "083060": 9, "083009": 9, "083084": 9, "083099": 9, "083010": 9, "083078":9, "083011": 9, "083014": 9
}

const struttureDistrettiMap = {
    //eventuali strutture che eccezionalmente non appartengono alla tabella dei comuni
}

export {struttureDistrettiMap,distretti,comuniDistretti}