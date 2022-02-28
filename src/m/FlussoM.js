import moment from 'moment';
import path  from 'path';
import readline from 'readline';
import md5File from 'md5-file';
import fs from 'fs';
import {common} from "../common.js";
import _ from 'lodash';
import MDBReader from "mdb-reader";
import {DatiStruttureProgettoTs} from "./DatiStruttureProgettoTs.js";
import ExcelJS from "exceljs"
import loki from 'lokijs';

export class FlussoM {
    /**
     * @param {ImpostazioniFlussoM} settings - Settings
     */
    constructor(settings, starts = this._startsFlussoMV10082012) {
        this._settings = settings;
        this._starts = starts
    }

    get settings() {
        return this._settings;
    }

    set settings(value) {
        this._settings = value;
    }

    get starts() {
        return this._starts;
    }

    set starts(value) {
        this._starts = value;
    }

    static PER_STRUTTURA = "PER_STRUTTURA"
    static PER_STRUTTURA_ANNO_MESE = "PER_STRUTTURA_ANNO_MESE"
    static TAB_TOTALI_PER_MESE = "TAB_TOTALI_PER_MESE"
    static TAB_CONSEGNE_PER_CONTENUTO = "TAB_CONSEGNE_PER_CONTENUTO"
    static TAB_CONSEGNE_PER_NOME_FILE = "TAB_CONSEGNE_PER_NOME_FILE"
    static TAB_DIFFERENZE_CONTENUTO_NOMEFILE = "TAB_DIFFERENZE_CONTENUTO_NOMEFILE"

    _startsFlussoMV10082012 = {
        regione: {id: 1, length: 3, type: "string", required: true},
        asID: {id: 2, length: 3, type: "string", required: true}, // codice azienda sanitaria
        arseID: {id: 3, length: 6, type: "string", required: true}, // codice regionale struttura erogatrice STS11
        brancaID: {id: 4, length: 2, type: "string", required: true}, // codice branca STS21
        mpID: {id: 5, length: 16, type: "string", required: true}, // codice medico prescrittore
        cognome: {id: 6, length: 30, type: "string", required: false}, // cognome utente
        nome: {id: 7, length: 20, type: "string", required: false}, // nome utente
        cf: {id: 8, length: 16, type: "string", required: true}, // codice fiscale
        sesso: {id: 9, length: 1, type: "string", required: false}, // sesso utente
        dataNascita: {id: 10, length: 8, type: "date", required: false}, // data Nascita Utente
        comRes: {id: 11, length: 6, type: "string", required: true}, // comune di residenza utente
        aspRes: {id: 12, length: 3, type: "string", required: true}, // Azienda Sanitaria provinciale di residenza
        dataPren: {id: 13, length: 8, type: "date", required: true}, // Data di Prenotazione, solo su riga 99
        ricettaID: {id: 14, length: 16, type: "string", required: true}, // Numero ricetta
        progrRicetta: {id: 15, length: 2, type: "string", required: true}, // Progressivo riga per ricetta
        diagnosi: {id: 16, length: 5, type: "string", required: false}, // codifica ICD9CM
        dataErog: {id: 17, length: 8, type: "date", required: true}, // Data erogazione, in caso di ciclo si riporta chisura ciclo
        nomID: {id: 18, length: 1, type: "string", required: true}, // codifica nomenclatore
        prestID: {id: 19, length: 7, type: "string", required: true}, // codice prestazione secondo nomenclatore
        quant: {id: 20, length: 3, type: "int", required: true}, // quantità
        ticket: {id: 21, length: 2, type: "double", required: true}, // posizione utente nei confronti del ticket
        esenzione: {id: 22, length: 6, type: "string", required: true}, // codice esenzione
        importoTicket: {id: 23, length: 7, type: "double", required: true}, // importo ticket
        totale: {id: 24, length: 8, type: "double", required: true}, // importo totale
        posContabile: {id: 25, length: 1, type: "string", required: true}, // posizione contabile
        recordID: {id: 26, length: 20, type: "string", required: true}, // identificativo Record
        CRIL: {id: 27, length: 8, type: "string", required: true}, // centro di rilevazione regionale CRIL
        op: {id: 28, length: 1, type: "string", required: true}, // onere prestazione
        tipoAccesso: {id: 29, length: 1, type: "string", required: true}, // tipo accesso, se è primo accesso o meno 0->altro 1-> primo accesso
        tempoMax: {id: 30, length: 1, type: "string", required: true}, // garanzia tempi massimi
        classePrior: {id: 31, length: 1, type: "string", required: true}, // Classe priorità
        vuoto: {id: 32, length: 2, type: "string", required: false}, // campo vuoto
    };


    #mRowToJson(row,starts ){
        var obj = {}
        let from = 0;
        for (let key in starts)
        {
            obj[key] = row.substr(from, starts[key].length).trim();
            if (starts[key].type === "date") {
                if (moment(obj[key], "DDMMYYYY").isValid())
                    obj[key] = moment(obj[key], "DDMMYYYY");
            }
            else if (starts[key].type === "double")
                obj[key] = obj[key] === "" ? 0 : parseFloat(obj[key].replace(',', '.'));
            else if (starts[key].type === "int")
                obj[key] = parseInt(obj[key]);
            from+= starts[key].length;
        }
        return obj;
    };

    #calcolaNumPrestazioni (righe) {
        let quanti = 0;
        for (let riga of righe) {
            quanti += parseInt(riga.quant);
        }
        return quanti;
    }

    #buildRicetteFromMRows (rows) {
        let ricetta = {}
        let riga99 = rows.filter((p) => p.progrRicetta === "99")[0];
        let prestazioni = rows.filter((p) => p.progrRicetta !== "99");
        var totPrestazioniCalcolate = prestazioni.reduce(function (tot, arr) {
            // return the sum with previous value
            return tot + arr.totale;
            // set initial value as 0
        }, 0);

        if (riga99 != null) {
            ricetta.id = riga99.ricettaID;
            ricetta.dataPren = moment(riga99.dataPren, "MM-DD-YYYY");
            ricetta.prestazioni = prestazioni;
            ricetta.codiceStruttura = riga99.arseID;
            ricetta.cf = riga99.cf;
            ricetta.riga99 = riga99;
            ricetta.numPrestazioni = this.#calcolaNumPrestazioni(prestazioni);
            ricetta.totale = riga99.totale;
            ricetta.totaleTicket = riga99.importoTicket;
            ricetta.differenzeTotale = parseFloat((totPrestazioniCalcolate - ricetta.totale - ricetta.totaleTicket).toFixed(2));
            ricetta.totalePrestazioniCalcolate = totPrestazioniCalcolate;
            return ricetta;
        } else {
            return null;
        }
    }

    #totaliMeseAnnoStruttura (ricette) {
        let out = {}
        for (let ricetta of ricette) {
            let key = null;
            let dataErog99 = ricetta.riga99.dataErog ? (ricetta.riga99.dataErog.month() + 1).toString() + ricetta.riga99.dataErog.year().toString() : null
            if (dataErog99?.length < 6)
                dataErog99 = "0" + dataErog99
            for (let prestazione of ricetta.prestazioni) {
                let dataErog = prestazione.dataErog ? (prestazione.dataErog.month() + 1).toString() + prestazione.dataErog.year().toString() : null;
                if (dataErog.length < 6)
                    dataErog = "0" + dataErog
                //if (dataErog !== dataErog99)
                //    console.log("data")
                key = (prestazione.arseID.substring(0, 4)) + (dataErog ?? dataErog99);
                if (!out.hasOwnProperty(key))
                    out[key] = {totaleLordo: 0, totaleTicket: 0, numPrestazioni: 0, totaleNetto: 0}
                out[key].totaleLordo += prestazione.totale;
                out[key].numPrestazioni += prestazione.quant;
                out[key].totaleNetto += ricetta.riga99.totale;
            }
            out[key].totaleTicket += ricetta.riga99.importoTicket;
            out[key].totaleNetto += ricetta.riga99.totale;
        }
        for (let key in out) {
            out[key].totaleLordo = parseFloat(out[key].totaleLordo.toFixed(2));
            out[key].totaleTicket = parseFloat(out[key].totaleTicket.toFixed(2));
            out[key].totaleNetto = parseFloat(out[key].totaleNetto.toFixed(2));
        }
        return out;
    }

    #checkMeseAnnoStruttura (ricette) {
        //chiave: mmAAAA, count: ?
        let datePrestazioni = {}
        let dateRiga99 = {}
        let dateMancanti99 = []
        let datePrestazioniMancanti = []
        let dateFuoriPeriodoDiCompetenza = []
        let codiceStruttura = null;
        for (let ricetta of ricette) {
            let key99 = null;
            if (!codiceStruttura && codiceStruttura !== "error") codiceStruttura = ricetta.riga99.arseID;
            if (ricetta.riga99.dataErog !== "") {
                try {
                    key99 = (ricetta.riga99.dataErog.month() + 1).toString() + ricetta.riga99.dataErog.year().toString()
                    if (key99.length === 5) key99 = "0" + key99;
                    if (ricetta.riga99.posContabile === "2" || ricetta.riga99.posContabile === "3") {
                        if (!dateFuoriPeriodoDiCompetenza.hasOwnProperty(key99))
                            dateFuoriPeriodoDiCompetenza[key99] = 1
                        else
                            dateFuoriPeriodoDiCompetenza[key99] = dateFuoriPeriodoDiCompetenza[key99] + 1;
                    } else { // se non c'è lo consideriamo nel periodo di competenza
                        if (!dateRiga99.hasOwnProperty(key99))
                            dateRiga99[key99] = 1
                        else
                            dateRiga99[key99] = dateRiga99[key99] + 1;
                    }
                    //controllo codice struttura
                    if (codiceStruttura !== "error")
                        if (codiceStruttura !== ricetta.riga99.arseID)
                            codiceStruttura = "error";
                } catch (ex) {
                    dateMancanti99.push(ricetta.riga99);
                }
            } else
                dateMancanti99.push(ricetta.riga99);
            for (let prestazione of ricetta.prestazioni) {
                if (prestazione.dataErog) {
                    try {
                        let key = (prestazione.dataErog.month() + 1).toString() + prestazione.dataErog.year().toString()
                        if (key.length === 5) key = "0" + key;
                        if (prestazione.posContabile === "2" || prestazione.posContabile === "3") {
                            if (!dateFuoriPeriodoDiCompetenza.hasOwnProperty(key))
                                dateFuoriPeriodoDiCompetenza[key] = 1
                            else
                                dateFuoriPeriodoDiCompetenza[key] = dateFuoriPeriodoDiCompetenza[key] + 1;
                        } else { // se non c'è lo consideriamo nel periodo di competenza
                            if (key99 === null || key === key99) {
                                if (!datePrestazioni.hasOwnProperty(key))
                                    datePrestazioni[key] = 0
                                else
                                    datePrestazioni[key] = datePrestazioni[key] + 1;
                            }
                        }
                        //controllo codice struttura
                        if (codiceStruttura !== "error")
                            if (codiceStruttura !== prestazione.arseID)
                                codiceStruttura = "error";
                    } catch (ex) {
                        datePrestazioniMancanti.push(prestazione);
                    }
                }
            }
        }
        let out = {date: [], risultato: {}}
        let totale = 0
        for (let key99 of Object.keys(dateRiga99)) {
            if (out.date.hasOwnProperty(key99))
                out.date[key99].count = out.date[key99].count + dateRiga99[key99];
            else
                out.date[key99] = {count: dateRiga99[key99]}
            totale += dateRiga99[key99];
        }
        for (let key of Object.keys(datePrestazioni)) {
            if (out.date.hasOwnProperty(key))
                out.date[key].count = out.date[key].count + datePrestazioni[key];
            else
                out.date[key] = {count: datePrestazioni[key]}
            totale += datePrestazioni[key];
        }
        for (let keyFuori of Object.keys(dateFuoriPeriodoDiCompetenza)) {
            if (out.date.hasOwnProperty(keyFuori))
                out.date[keyFuori].count = out.date[keyFuori].count + dateFuoriPeriodoDiCompetenza[keyFuori];
            else
                out.date[keyFuori] = {count: dateFuoriPeriodoDiCompetenza[keyFuori]}
            totale += dateFuoriPeriodoDiCompetenza[keyFuori];
        }
        let chiaveDataPrevalente = null
        for (let key of Object.keys(out.date)) {
            if (chiaveDataPrevalente === null)
                chiaveDataPrevalente = key;
            out.date[key].percentuale = ((out.date[key].count * 100) / totale).toFixed(2);
            if (out.date[key].percentuale > out.date[chiaveDataPrevalente].percentuale)
                chiaveDataPrevalente = key;
        }
        return {
            meseAnnoPrevalente: chiaveDataPrevalente,
            totale: out.date[chiaveDataPrevalente].count,
            percentuale: out.date[chiaveDataPrevalente].percentuale,
            codiceStruttura: codiceStruttura,
            date: out.date,
        };
    }

    async #processLineByLine(filePath, lunghezzaRiga) {
        let errors = [];
        const fileStream = fs.createReadStream(filePath);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        // Note: we use the crlfDelay option to recognize all instances of CR LF
        // ('\r\n') in input.txt as a single line break.

        let nLine = 0;
        for await (const line of rl) {
            // Each line in input.txt will be successively available here as `line`.
            nLine++;
            if (line.length !== lunghezzaRiga) {
                console.log("file: " + filePath);
                console.log('length: ' + line.length);
                console.log('nLine: ' + nLine);
                errors.push({file: filePath, lunghezza: line.length, linea: nLine})
            }
        }
        return errors;
    }


    #verificaLunghezzaRiga () {
        let lunghezza = 0;
        for (let val of Object.values(this._starts))
            lunghezza += val.length;
        return lunghezza;
    }


    async #elaboraFileFlussoM(filePath) {
        console.log("Elaboro " + filePath + " ...");
        const fileStream = fs.createReadStream(filePath);

        const rl = readline.createInterface({input: fileStream, crlfDelay: Infinity});
        var i = 0;
        var ricette = {};
        var ricettaTemp = [];
        let totale = {
            totale: 0,
            ticket: 0,
            numPrestazioni: 0,
            totalePrestazioniCalcolate: 0
        }
        let lunghezzaRiga = this.#verificaLunghezzaRiga(this._starts);
        let error = null;
        for await (const line of rl) {
            if (line.length !== lunghezzaRiga) {
                error = i;
                break;
            } else {
                var t = this.#mRowToJson(line, this._starts);
                ricettaTemp.push(t);
                if (t.progrRicetta === "99") {
                    var rt = this.#buildRicetteFromMRows(ricettaTemp);
                    //TODO: filtro?
                    ricette[rt.id] = rt;
                    totale.totalePrestazioniCalcolate = totale.totalePrestazioniCalcolate + rt.totalePrestazioniCalcolate;
                    totale.numPrestazioni = totale.numPrestazioni + rt.numPrestazioni;
                    totale.totale = totale.totale + rt.totale;
                    totale.ticket = totale.ticket + rt.totaleTicket;
                    ricettaTemp = [];
                }
                i++;
            }
        }
        if (error === null) {
            totale.totalePrestazioniCalcolate = parseFloat(totale.totalePrestazioniCalcolate.toFixed(2));
            totale.totale = parseFloat(totale.totale.toFixed(2));
            totale.ticket = parseFloat(totale.ticket.toFixed(2));
            let datiDaFile = this.#controllaNomeFileFlussoM(path.basename(filePath));
            let calcolaPrestazioniPerMese = this.#totaliMeseAnnoStruttura(Object.values(ricette))
            return {
                nomeFile: path.basename(filePath),
                datiDaFile: datiDaFile,
                absolutePath: filePath,
                hash: md5File.sync(filePath),
                totaleNetto: totale.totale,
                totaleLordo: parseFloat((totale.totale + totale.ticket).toFixed(2)),
                totaleTicket: totale.ticket,
                numPrestazioni: totale.numPrestazioni,
                totaleLordoPrestazioniCalcolate: parseFloat(totale.totalePrestazioniCalcolate.toFixed(2)),
                calcolaPrestazioniPerMese: calcolaPrestazioniPerMese,
                numeroRighe: i,
                numeroRicette: Object.values(ricette).length,
                ricette: ricette,
                nonOk: Object.values(ricette).filter((p) => p.differenzeTotale !== 0)
            }
        } else
            return {
                error: true,
                rowError: i + 1,
                nomeFile: path.basename(filePath),
                absolutePath: filePath,
                hash: md5File.sync(filePath)
            }
    }

    #controllaNomeFileFlussoM (nome) {
        try {
            if (nome.length !== 14)
                return null;
            return {
                idDistretto: nome.substring(0, 1),
                codStruttura: nome.substring(1, 5),
                mese: nome.substring(5, 7),
                anno: "20" + nome.substring(7, 9),
            }
        } catch (ex) {
            return null;
        }
    }


    #loadStruttureFromFlowlookDB () {
        const buffer = fs.readFileSync(this._settings.flowlookDBFilePath);
        const reader = new MDBReader(buffer);

        const strutture = reader.getTable(this._settings.flowlookDBTable).getData();
        let struttureFiltrate = strutture.filter(p => p["CodiceAzienda"] === this._settings.codiceAzienda && p["CodiceRegione"] === this._settings.codiceRegione);
        let mancanti = []
        let struttureOut = {}
        struttureFiltrate.forEach(p => {
            if (this._settings.datiStruttureRegione.comuniDistretti.hasOwnProperty(p["CodiceComune"])) {
                struttureOut[p['CodiceStruttura']] = {
                    codiceRegione: p['CodiceRegione'],
                    codiceAzienda: p['CodiceAzienda'],
                    denominazione: p['DenominazioneStruttura'],
                    codiceComune: p['CodiceComune'],
                    idDistretto: this._settings.datiStruttureRegione.comuniDistretti[p["CodiceComune"]],
                    dataUltimoAggiornamento: moment(p['DataAggiornamento'], 'DD/MM/YYYY')
                };
            } else
                mancanti.push(p);
        })
        return struttureOut;
    }


    async elaboraFlussi() {
        let fileOut = {ripetuti: [], ok: {}, errori: []}
        //1- ottieni tutti i file txt della cartella
        let allFiles = common.getAllFilesRecursive(this._settings.in_folder, this._settings.extensions);
        let numFiles = allFiles.length;
        var progress = 0;
        // 2- elaborazione
        for (var file of allFiles) {
            let md5 = md5File.sync(file);
            if (!fileOut.ok.hasOwnProperty(md5)) {
                let ricetta = await this.#ottieniStatDaFileFlussoM(file)
                if (!ricetta.errore)
                    fileOut.ok[ricetta.out.hash] = _.omit(ricetta.out, ["ricette", "nonOk"])
                else
                    fileOut.errori.push(ricetta.out)
                console.log("elaborazione: " + ++progress + " di " + numFiles)
            } else {
                console.log("elaborazione: " + ++progress + " di " + numFiles + "\n File già presente")
                fileOut.ripetuti.push([fileOut.ok[md5].absolutePath, this._settings.in_folder + path.sep + file]);
            }
        }
        return fileOut;
    }

    async #ottieniStatDaFileFlussoM(file) {
        let strutture = this.#loadStruttureFromFlowlookDB();
        let ricetteInFile = await this.#elaboraFileFlussoM(file, this._starts);
        if (ricetteInFile.error) {
            console.log("file " + file + " con errori");
            return {errore: true, out: ricetteInFile};
        } else {
            let verificaDateStruttura = this.#checkMeseAnnoStruttura(Object.values(ricetteInFile.ricette))
            ricetteInFile.codiceStruttura = verificaDateStruttura.codiceStruttura;
            ricetteInFile.idDistretto = strutture[verificaDateStruttura.codiceStruttura].idDistretto.toString();
            ricetteInFile.annoPrevalente = verificaDateStruttura.meseAnnoPrevalente.substr(2, 4);
            ricetteInFile.mesePrevalente = verificaDateStruttura.meseAnnoPrevalente.substr(0, 2);
            ricetteInFile.date = _.omitBy(verificaDateStruttura.date, _.isNil);
            return {errore: false, out: ricetteInFile}
        }
    }

    #calcolaDifferenzeDaTs (dati) {
        if (dati.hasOwnProperty("controlloTs") && dati.controlloTs.error === false) {
            return {
                differenzaTotaleNetto: (dati.controlloTs.out.netto_mese_totale - dati.totaleNetto).toFixed(2),
                differenzaTotale: (dati.controlloTs.out.importo_totale - dati.totaleLordo).toFixed(2),
                differenzaTicket: (dati.controlloTs.out.ticket_totale - dati.totaleTicket).toFixed(2),
                differenzaPrestazioni: dati.controlloTs.out.numeroPrestazioni - dati.numPrestazioni,
                differenzaRicette: dati.controlloTs.out.numero_ricette - dati.numeroRicette
            }
        }
    }

    async #scriviFlussoMSuCartella(fileElaborati, controlloTs, scriviStats = true) {
        fs.rmSync(this._settings.out_folder, {recursive: true, force: true});
        fs.mkdirSync(this._settings.out_folder);
        for (let chiave in fileElaborati) {
            let file = fileElaborati[chiave]
            let anno = file.datiDaFile?.anno ?? file.annoPrevalente;
            let mese = file.datiDaFile?.mese ?? file.mesePrevalente;
            if (Object.keys(controlloTs).length > 0) {
                fileElaborati[chiave].controlloTs = controlloTs[file.codiceStruttura + "-" + mese + anno];
                fileElaborati[chiave].differenze = this.#calcolaDifferenzeDaTs(fileElaborati[chiave])
            }
            if (!fs.existsSync(this._settings.out_folder + path.sep + anno)) {
                fs.mkdirSync(this._settings.out_folder + path.sep + anno);
            }
            if (!fs.existsSync(this._settings.out_folder + path.sep + anno + path.sep + mese)) {
                fs.mkdirSync(this._settings.out_folder + path.sep + anno + path.sep + mese);
            }
            let fname = this._settings.out_folder + path.sep + anno + path.sep + mese + path.sep + (file.idDistretto === undefined ? "X" : file.idDistretto) + file.codiceStruttura.substr(0, 4) + mese + anno.substr(2, 2) + "M.txt";
            fs.copyFileSync(file.absolutePath, fname);
            fileElaborati[chiave].tempPath = fname;
        }
        if (scriviStats)
            await this.scriviStatsFlussoM(fileElaborati)
    }

    #replacer(key, value) {
        if (value instanceof Map) {
            return {
                dataType: 'Map',
                value: Array.from(value.entries()), // or with spread: value: [...value]
            };
        } else {
            return value;
        }
    }

    generaGridJSTable (salvaSuFile= true) {
        let idDistretti = Object.keys(this._settings.datiStruttureRegione.distretti);
        let strutture = this.#loadStruttureFromFlowlookDB();
        let files = common.getAllFilesRecursive(this._settings.out_folder, '.mstats');
        let data = [];
        for (let file of files) {
            let rawdata = fs.readFileSync(file);
            let dati = JSON.parse(rawdata);
            data.push(dati)
        }
        for (let distretto of idDistretti) {
            let nomeFile;
            let filteredData = []
            let gridData = [];
            if (distretto !== "") {
                filteredData = data.filter(p => p.idDistretto.toString() === distretto.toString())
                nomeFile = this._settings.datiStruttureRegione.distretti[distretto].toUpperCase() + ".html";
            } else {
                filteredData = filteredData.sort(p => p.idDistretto)
                nomeFile = "out.html"
            }
            if (filteredData.length > 0) {
                for (let struttureFile of filteredData) {
                    gridData.push(
                        [
                            struttureFile.codiceStruttura,
                            strutture[struttureFile.codiceStruttura].denominazione.toUpperCase(),
                            this._settings.datiStruttureRegione.distretti[struttureFile.idDistretto],
                            (struttureFile.datiDaFile?.mese ?? struttureFile.mesePrevalente),
                            (struttureFile.datiDaFile?.anno ?? struttureFile.annoPrevalente),
                            struttureFile.numeroRighe,
                            struttureFile.numeroRicette,
                            struttureFile.numPrestazioni,
                            struttureFile.totaleNetto,
                            struttureFile.totaleTicket,
                            struttureFile.totaleLordo,
                            //!struttureFile.controlloTs.error ? ...[
                            struttureFile.controlloTs?.out.is_definitivo === true ? "COMPLETI" : (struttureFile.hasOwnProperty("controlloTs") ? "INCOMPLETI" : "NON PRESENTI"),
                            struttureFile.controlloTs?.out.numero_ricette ?? "-",
                            struttureFile.controlloTs?.out.numeroPrestazioni ?? "-",
                            struttureFile.controlloTs?.out.netto_mese_totale ?? "-",
                            struttureFile.controlloTs?.out.ticket_totale ?? "-",
                            struttureFile.controlloTs?.out.importo_totale ?? "-",
                            struttureFile.controlloTs?.out.dataOra ?? "-",
                            //"<td colspan='5'>Dati non disponibili</td>") +
                            //(struttureFile.differenze !== null ? (
                            struttureFile.differenze?.differenzaRicette ?? "-",
                            struttureFile.differenze?.differenzaPrestazioni ?? "-",
                            struttureFile.differenze?.differenzaTotaleNetto ?? "-",
                            struttureFile.differenze?.differenzaTicket ?? "-",
                            struttureFile.differenze?.differenzaTotale ?? "-",
                            //    ) : ("<td colspan='4'>Dati non disponibili</td>")) +
                        ]
                    )
                }
                if (salvaSuFile) {
                    const __dirname = path.resolve();
                    let rawdata = fs.readFileSync(path.resolve(__dirname, "src/grid/flussoM-mese.html")).toLocaleString();
                    rawdata = rawdata.replace("[xxx]", JSON.stringify(gridData));
                    rawdata = rawdata.replace("<h1></h1>",
                        "<h1>Distretto di " + nomeFile.substring(0, nomeFile.length - 5) + "</h1>"
                    )
                    fs.writeFileSync(this._settings.out_folder + path.sep + nomeFile, rawdata);
                }
            }
        }
    }

    scriviStatsFlussoM (fileData,sovrascrivi=true, ext = ".mstats") {
        for (let file in fileData) {
            let md5 = file
            let dirName = path.dirname(fileData[file].tempPath)
            if (!fs.existsSync(dirName + path.sep + this._settings.stat_folder_name))
                fs.mkdirSync(dirName + path.sep + this._settings.stat_folder_name);
            if (sovrascrivi || !fs.existsSync(dirName + path.sep + this._settings.stat_folder_name + path.sep + md5 + ext))
                fs.writeFileSync(dirName + path.sep + this._settings.stat_folder_name + path.sep + md5 + ext, JSON.stringify(_.omit(fileData[file], ["absolutePath", "nomeFile", "tempPath"]), this.#replacer, "\t"), 'utf8');
        }
    }




    async trovaRicetteDuplicate(folder, scriviFileDifferenze, divisiPerTipologia = null, includiComunqueRicetteDuplicateNellaDivisione = false) {
        let cartellaTipologia;
        if (divisiPerTipologia !== null) {
            cartellaTipologia = folder  + path.sep + "SUDDIVISI_" + divisiPerTipologia;
            fs.rmSync(cartellaTipologia, { recursive: true, force: true });
            fs.mkdirSync(cartellaTipologia);
        }
        let lunghezzaRiga = this.#verificaLunghezzaRiga(this._starts);

        const calcolaMeseAnnoPrestazioni = (righeRicetta) =>
        {
            let annoMese = {}
            let data99 = "";
            for (let riga of righeRicetta)
            {
                if (riga.dataErog && riga.dataErog.isValid()) {
                    let anno = riga.dataErog.year().toString();
                    let mese = (riga.dataErog.month() +1) <10 ? ("0" + (riga.dataErog.month() +1).toString()) : (riga.dataErog.month() +1).toString()
                    if (riga.progrRicetta === "99")
                        data99 = anno + mese;
                    else {
                        if (annoMese.hasOwnProperty(anno + mese))
                            annoMese[anno + mese] += 1;
                        else
                            annoMese[anno + mese] = 1;
                    }
                }
                else if (riga.progrRicetta !== "99")
                    return "XXXXXX";
            }
            if (Object.keys(annoMese).length === 1)
                return Object.keys(annoMese)[0];
            else if (data99 !== "")
                return data99;
            else
                return "XXXXXX";
        }

        let db = new loki('index.db');
        let ricetteTable = db.addCollection('ricette', {
            unique: ['id'],
            indices: ['id']
        });
        let duplicati = db.addCollection('duplicati');
        let allFiles = common.getAllFilesRecursive(folder, this._settings.extensions);
        let logger = {}
        if (scriviFileDifferenze) {
            logger["loggerNoDuplicati"] = fs.createWriteStream(folder + path.sep + "no_duplicati.txt", {
                flags: 'a+' // 'a' means appending (old data will be preserved)
            })
            logger["loggerDuplicati"] = fs.createWriteStream(folder + path.sep + "solo_duplicati.txt", {
                flags: 'a+' // 'a' means appending (old data will be preserved)
            })
        }
        let numFile = 0;
        let numDuplicati = 0;
        for (let file of allFiles) {
            console.log("[" + ++numFile + " di " + allFiles.length + "] [DUPL: " + numDuplicati + "] - Elaboro " + file +  " ...");
            const fileStream = fs.createReadStream(file);
            const fileSizeInMB = (fs.statSync(file).size / 1000000).toFixed(2);
            const rl = readline.createInterface({input: fileStream, crlfDelay: Infinity});
            let i = 0;
            let ricettaTemp = [];
            let ricettaTempString = "";
            let error = null;
            for await (const line of rl) {
                if (line.length !== lunghezzaRiga) {
                    error = i;
                    break;
                } else {
                    let t = this.#mRowToJson(line, this._starts);
                    ricettaTempString+= (line + "\n");
                    ricettaTemp.push(t);
                    if (t.progrRicetta === "99") {
                        let duplicata = false;
                         try {
                             ricetteTable.insert({id:t.ricettaID, file: file, line: i});
                         }
                         catch (ex) {
                             numDuplicati++;
                             duplicata = true;
                             if (scriviFileDifferenze)
                                 logger["loggerDuplicati"].write(ricettaTempString)
                             let duplicato = duplicati.findOne({id: t.ricettaID});
                             if (!duplicato) {
                                 let primo = ricetteTable.findOne({id: t.ricettaID});
                                 duplicati.insert({ id: t.ricettaID, info: [ {file: primo.file, line: primo.line} , { file: file, line: i  } ] })
                             }
                             else {
                                 duplicato.info.push({file: file, line: i})
                                 duplicati.update(duplicato)
                             }
                         }
                         if (!duplicata || includiComunqueRicetteDuplicateNellaDivisione) {
                             if (scriviFileDifferenze)
                                 logger["loggerNoDuplicati"].write(ricettaTempString)
                             if (divisiPerTipologia && scriviFileDifferenze) {
                                 let key = "";
                                 switch (divisiPerTipologia) {
                                     case FlussoM.PER_STRUTTURA:
                                         key = t.arseID;
                                         break;
                                     case FlussoM.PER_STRUTTURA_ANNO_MESE:
                                         key = t.arseID + "-" + calcolaMeseAnnoPrestazioni(ricettaTemp);
                                 }
                                 if (!logger.hasOwnProperty(key))
                                     logger[key] = fs.createWriteStream(cartellaTipologia + path.sep + key + ".txt", {
                                         flags: 'a+' // 'a' means appending (old data will be preserved)
                                     })
                                 logger[key].write(ricettaTempString);
                             }
                         }
                        ricettaTemp = [];
                        ricettaTempString = "";
                    }
                    if (++i % 100000 === 0) {
                        console.log("[" + numFile + " di " + allFiles.length + "] [DUPL: " + numDuplicati + "] [" + ((i * lunghezzaRiga) / 1000000).toFixed(2) + " mb su " + fileSizeInMB + "] - Elaboro " + file +  " ...");
                    }
                }
            }

        }
        if (scriviFileDifferenze)
            for (let loggerKey in logger)
                logger[loggerKey].end();
        let duplicatiObj =  duplicati.find({});
        let duplicatiJson = {}
        duplicatiObj.forEach((duplicato) => {
            duplicatiJson[duplicato.id] = duplicato.info;
        })
        if (scriviFileDifferenze)
            fs.writeFileSync(folder + path.sep + "duplicatiSTAT.json", JSON.stringify(duplicatiJson, this.#replacer, "\t"), 'utf8')
        return {
            numDuplicati: numDuplicati,
            stats: duplicatiJson
        };
    }

    async unisciFileTxt(inFolder = this._settings.in_folder, outFolder = this._settings.out_folder) {
        let errors = [];
        let allFiles = common.getAllFilesRecursive(inFolder, this._settings.extensions);
        let lunghezzaRiga = this.#verificaLunghezzaRiga(this._starts);
        const outputFile = outFolder + path.sep + '190205_000_XXXX_XX_M_AL_20XX_XX_XX.TXT';
        var logger = fs.createWriteStream(outputFile, {
            flags: 'a' // 'a' means appending (old data will be preserved)
        })
        var writeLine = (line) => logger.write(`${line}\n`);
        for (var file of allFiles) {
            const fileStream = fs.createReadStream(file);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let nLine = 0;
            for await (const line of rl) {
                writeLine(line);
                // Each line in input.txt will be successively available here as `line`.
                nLine++;
                if (line.length !== lunghezzaRiga) {
                    console.log("file: " + file);
                    console.log('length: ' + line.length);
                    console.log('nLine: ' + nLine);
                    errors.push({file: file, lunghezza: line.length, linea: nLine})
                }
            }
        }
        logger.end();
        if (errors.length === 0) {
            //verifica
            console.log("verifica.. ");
            errors = [...errors, ...await this.#processLineByLine(outputFile, lunghezzaRiga)]
            if (errors.length === 0)
                console.log("verifica ok");
            else {
                console.log("ERRORI");
                console.table(errors);
            }
        }
        return {error: errors.length !== 0, errors: errors}
    }


    async eseguiElaborazioneCompletaFlussoMDaCartella(scriviSuCartella, controllaSuTs, generaStats, eseguiComunqueConDuplicati = false) {
        let ris = await this.elaboraFlussi();
        let duplicati
        if (ris.errori.length === 0)
            duplicati = await this.trovaRicetteDuplicate(this._settings.in_folder,false);
        if (ris.errori.length === 0 && (duplicati.numDuplicati === 0 || eseguiComunqueConDuplicati)) {
            let strutturePerControlloTS = {};
            for (let value of Object.values(ris.ok))
                strutturePerControlloTS[value.codiceStruttura + "-" + (value.datiDaFile?.mese ?? value.mesePrevalente) + (value.datiDaFile?.anno ?? value.annoPrevalente)] =
                    {
                        mese: (value.datiDaFile?.mese ?? value.mesePrevalente),
                        anno: (value.datiDaFile?.anno ?? value.annoPrevalente),
                        codiceRegione: "190",
                        codiceAsl: "205",
                        codiceStruttura: value.codiceStruttura
                    };
            let outTS = []
            if (controllaSuTs) {
                const verificaTS = new DatiStruttureProgettoTs(this._settings)
                outTS = await verificaTS.ottieniInformazioniStrutture(strutturePerControlloTS);
            }
            if (scriviSuCartella)
                await this.#scriviFlussoMSuCartella(ris.ok, outTS);
            if (generaStats) {
                this.generaGridJSTable();
            }
            //controllo post
            console.log("Elaborazione completata, di seguito gli errori trovati")
            console.table(this.verificaErroriDaStats(this._settings.out_folder))
            console.log("Duplicati: " + duplicati?.numDuplicati ?? "Controllo non effettuato");
            console.table(duplicati?.stats || "Controllo non effettuato");
            return true;
        } else {
            console.log("Errori rilevati")
            console.table(ris.errori);
            console.log("Duplicati: " + duplicati?.numDuplicati ?? "Controllo non effettuato");
            console.table(duplicati?.stats || "Controllo non effettuato");
            return false;
        }
    }

    verificaErroriDaStats (filePath) {
        let errors = [];
        let files = common.getAllFilesRecursive(filePath, '.mstats');

        for (let file of files) {
            let rawdata = fs.readFileSync(file);
            let dati = JSON.parse(rawdata);
            let key;
            try {
                key = dati.idDistretto + dati.codiceStruttura.substring(0, 4) + (!dati.hasOwnProperty("datiDaFile") ? (dati.datiDaFile.mese + dati.datiDaFile.anno.substring(0, 2)) : (dati.mesePrevalente + dati.annoPrevalente)) + "M";
            } catch (ex) {
                console.log(ex);
            }
            if (dati.hasOwnProperty("datiDaFile")) {
                let error = "";
                try {
                    if (dati.datiDaFile!== null) {
                        if (dati.datiDaFile?.idDistretto?.toString() !== dati.idDistretto.toString())
                            error = "idDistretto";
                        if ((dati.datiDaFile?.codStruttura + "00") !== dati.codiceStruttura)
                            error += " codStruttura";
                        if (dati.datiDaFile?.mese !== dati.mesePrevalente || dati.datiDaFile.anno !== dati.annoPrevalente)
                            error += " data"
                        if (error !== "")
                            errors.push({
                                error: true,
                                chiave: key,
                                tipoErrore: "Nome file differente dal contenuto",
                                dettagli: error.trim(),
                                mstatFile: file
                            })
                    }
                    else
                        errors.push({
                            error: true,
                            chiave: key,
                            tipoErrore: "datiDaFile non presente",
                            dettagli: "",
                            mstatFile: file
                        })
                } catch (ex) {
                    errors.push({
                        error: true,
                        chiave: key,
                        tipoErrore: "Altro errore",
                        dettagli: ex,
                        mstatFile: file
                    })
                }
            }
        }
        return errors;
    }

    async verificaCorrettezzaFileMInCartella(pathCartella) {
        let lunghezzaRiga = this.#verificaLunghezzaRiga(this._starts);
        let errors = [];
        let allFiles = common.getAllFilesRecursive(pathCartella, this._settings.extensions);
        for (var file of allFiles) {
            console.log("processing " + file + "...");
            errors = [...errors, ...await this.#processLineByLine(file, lunghezzaRiga)]
        }
        console.log("FINE");
        console.log(errors);
    }

    async provaExcel() {


        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("prova");
        sheet.columns = [
            { header: 'Id', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 32 },
            { header: 'D.O.B.', key: 'DOB', width: 10, headerCount:2},
            { header: 'bau', key: 'bau', width: 32 },
        ];
        sheet.insertRow(2, {id: 1, name: "prova", DOB: "ciao", bau: "asdasd asdasdasdasd"});
        await workbook.xlsx.writeFile(this._settings.out_folder + path.sep + "prova22.xlsx");
    }

    async generaFileExcelPerAnno(nomeFile, anno, cosaGenerare = [FlussoM.PER_STRUTTURA_ANNO_MESE, FlussoM.TAB_CONSEGNE_PER_CONTENUTO, FlussoM.TAB_CONSEGNE_PER_NOME_FILE, FlussoM.TAB_DIFFERENZE_CONTENUTO_NOMEFILE] ) {
        let strutture = this.#loadStruttureFromFlowlookDB();
        let files = common.getAllFilesRecursive(this._settings.out_folder, '.mstats');
        let data = [];
        for (let file of files) {
            let rawdata = fs.readFileSync(file);
            let dati = JSON.parse(rawdata);
            data.push(dati)
        }

        const workbook = new ExcelJS.Workbook();
        let sheets = [];
        for (let sheet of cosaGenerare) {
            sheets[sheet] = workbook.addWorksheet(sheet);
            if (sheet === FlussoM.PER_STRUTTURA_ANNO_MESE ||
                sheet === FlussoM.TAB_CONSEGNE_PER_NOME_FILE ||
                sheet === FlussoM.TAB_CONSEGNE_PER_CONTENUTO ||
                sheet === FlussoM.TAB_DIFFERENZE_CONTENUTO_NOMEFILE
            )
                sheets[sheet].columns = [
                    {header: 'Id', key: 'id'},
                    {header: 'Distretto', key: 'distretto'},
                    {header: 'Descrizione', key: 'descrizione'},
                    {header: 'Gennaio', key: '01'},
                    {header: 'Febbraio', key: '02'},
                    {header: 'Marzo', key: '03'},
                    {header: 'Aprile', key: '04'},
                    {header: 'Maggio', key: '05'},
                    {header: 'Giugno', key: '06'},
                    {header: 'Luglio', key: '07'},
                    {header: 'Agosto', key: '08'},
                    {header: 'Settembre', key: '09'},
                    {header: 'Ottobre', key: '10'},
                    {header: 'Novembre', key: '11'},
                    {header: 'Dicembre', key: '12'}
                ];
        }

        //const cell = worksheet.getCell('C3');
        //cell.value = new Date(1968, 5, 1);

        let error = [];
        let outData = {}
        for (let file of data) {
            let anno = file.annoPrevalente ?? file.datiDaFile?.anno;
            let mese = file.mesePrevalente ?? file.datiDaFile?.mese;
            if (anno === null || mese == null)
                error.push({tipo: "Mese anno non validi", file: file});
            else {
                for (let tab of cosaGenerare) {
                    anno = tab === FlussoM.TAB_CONSEGNE_PER_NOME_FILE ? (file.datiDaFile?.anno ?? anno) : anno;
                    mese = tab === FlussoM.TAB_CONSEGNE_PER_NOME_FILE ? (file.datiDaFile?.mese ?? mese) : mese;
                    if (!outData.hasOwnProperty(tab)) outData[tab] = {}
                    switch (tab) {
                        case FlussoM.PER_STRUTTURA_ANNO_MESE:
                        case FlussoM.TAB_CONSEGNE_PER_NOME_FILE:
                        case FlussoM.TAB_CONSEGNE_PER_CONTENUTO:
                        case FlussoM.TAB_DIFFERENZE_CONTENUTO_NOMEFILE:
                            if (anno === anno.toString()) {
                                if (!outData[tab].hasOwnProperty(file.codiceStruttura))
                                    outData[tab][file.codiceStruttura] = {
                                        id: file.codiceStruttura,
                                        descrizione: strutture[file.codiceStruttura].denominazione,
                                        distretto: this.settings.datiStruttureRegione.distretti[file.idDistretto]
                                    }
                                if (!outData[tab][file.codiceStruttura].hasOwnProperty(mese)) {
                                    if (tab === FlussoM.PER_STRUTTURA_ANNO_MESE)
                                        outData[tab][file.codiceStruttura][mese] = file.totaleNetto;
                                    else if (tab === FlussoM.TAB_CONSEGNE_PER_NOME_FILE)
                                        outData[tab][file.codiceStruttura][mese] = file.datiDaFile.idDistretto+ file.datiDaFile.codStruttura + file.datiDaFile.mese + file.datiDaFile.anno;
                                    else if (tab === FlussoM.TAB_CONSEGNE_PER_CONTENUTO)
                                        outData[tab][file.codiceStruttura][mese] = file.datiDaFile.idDistretto+ file.datiDaFile.codStruttura + mese + anno;
                                    else if (tab === FlussoM.TAB_DIFFERENZE_CONTENUTO_NOMEFILE)
                                        outData[tab][file.codiceStruttura][mese] = (file.datiDaFile?.mese === file.mesePrevalente) && (file.datiDaFile?.anno === file.annoPrevalente) ? "OK": "*NO*"
                                } else {
                                    if (FlussoM.PER_STRUTTURA_ANNO_MESE)
                                        error.push({tipo: "File Duplicato nel mese", file: file});
                                    else if (FlussoM.TAB_CONSEGNE_PER_NOME_FILE)
                                        outData[tab][file.codiceStruttura][mese]+= " - " + file.datiDaFile.idDistretto+ file.datiDaFile.codStruttura + file.datiDaFile.mese + file.datiDaFile.anno;
                                    else if (tab === FlussoM.TAB_CONSEGNE_PER_CONTENUTO)
                                        outData[tab][file.codiceStruttura][mese]+= " - " + file.datiDaFile.idDistretto+ file.datiDaFile.codStruttura + mese + anno;
                                    else if (tab === FlussoM.TAB_DIFFERENZE_CONTENUTO_NOMEFILE)
                                        outData[tab][file.codiceStruttura][mese]+= " - " + (file.datiDaFile?.mese === file.mesePrevalente) && (file.datiDaFile?.anno === file.annoPrevalente) ? "OK": "*NO*"
                                }
                            } else if (!anno)
                                error.push({tipo: "Anno non elaborato", file: file});
                            break;

                    }
                }
            }
        }
        for (let tab of cosaGenerare) {
            for (let dato in outData[tab]) {
                sheets[tab].insertRow(2, outData[tab][dato]);
            }
        }

        await workbook.xlsx.writeFile(this._settings.out_folder + path.sep + nomeFile);
        console.log(error)
    }

}