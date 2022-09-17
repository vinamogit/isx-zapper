import canClaim from './predicates.js';

const ISX = new StellarSdk.Asset("ISX", "GBPB3G2LWSCUSGJTAUHRKOGBSXFDGDOHRGY5QXISNMWQEY6PDLY3YCD6");
var isxbalance = 0;
var accountId = "";
const simpleSignerUrl = 'https://sign.plutodao.finance';

function openConnectWindow() {
    window.open(
        `${simpleSignerUrl}/connect?wallets=xbull&wallets=freighter&wallets=albedo&wallets=rabet`,
        'Connect_Window',
        'width=360, height=450',
    );
}

function handleMessage(e) {
    // Reject messages that are not coming from simple signer (tailor this according to your needs)
    if (e.origin !== simpleSignerUrl) {
        return;
    }

    const messageEvent = e.data;

    console.log(messageEvent)

    if (messageEvent.type === 'onConnect') {
        const publicKey = messageEvent.message.publicKey;
        // Validate the public key received. This is just good practice.
        if (StellarSdk.Keypair.fromPublicKey(publicKey)) {
            // console.log('The public key is', publicKey);

            (
                async (publicKey) => {

                    let server = new StellarSdk.Server("https://horizon.stellar.org");
                    let account = await server.loadAccount(publicKey);
                    // console.log(account)

                    accountId = publicKey;

                    if (account) {
                        displayAccount(account)
                    }
                }
            )(publicKey)
        }
    }

    if (messageEvent.type === 'onSign' && messageEvent.page === 'sign') {
        const eventMessage = messageEvent;

        const signedXdr = eventMessage.message.signedXDR;
        // Validate the XDR, this is just good practice.
        if (
            StellarSdk.xdr.TransactionEnvelope.validateXDR(
                signedXdr,
                'base64',
            )
        ) {
            const server = new StellarSdk.Server(
                'https://horizon.stellar.org/',
            );

            const transaction =
                StellarSdk.TransactionBuilder.fromXDR(
                    signedXdr,
                    StellarSdk.Networks.PUBLIC
                );

            // console.log(signedXdr)
            try {
                server.submitTransaction(transaction).then(result => {
                    let txhash = transaction.hash().toString('hex');
                    document.getElementById("transaction").innerHTML = `View on <a target="_blank" href="https://stellar.expert/explorer/public/tx/${txhash}">stellar.expert</a>`;

                    server.loadAccount(accountId).then(account => {
                        // console.log("Update account view")
                        displayAccount(account)
                    });
                    zabButtons(false);
                }).catch(err => {
                    // console.log(err)
                    document.getElementById("transaction").innerHTML = `Zapping failed`;
                    zabButtons(false);
                })
            } catch (err) {
                console.error(err);
            }
        }
    }

    if (
        e.origin === simpleSignerUrl &&
        e.data.type === 'onReady' &&
        e.data.page === 'sign'
    ) {
        zabButtons(true);
    }

    if ((messageEvent.type === 'onCancel') && messageEvent.page === 'sign') {
        zabButtons(false);
    }
}

function zabButtons(disable) {
    document.getElementById("zapbutton").disabled = disable;
    document.getElementById("zapbuttoncb").disabled = disable;
}

function displayAccount(account) {

    var knownassets = [];

    let accountDisplay = account.id.substring(0, 4) + "..." + account.id.substring(52, 56);
    let img = `<img src="https://id.lobstr.co/${account.id}.png" style="height: 1em"/>&nbsp;`;
    document.getElementById("account").innerHTML = img + accountDisplay;

    let hasisx = false;
    for (let balance of account.balances) {
        let code = balance.asset_code;
        let issuer = balance.asset_issuer;
        if (code && issuer) {
            knownassets.push(code + ":" + issuer);
            if (code == ISX.code && issuer == ISX.issuer) {
                // console.log("ISX " + balance.balance)
                isxbalance = parseFloat(balance.balance)
                document.getElementById("balance").innerHTML = balance.balance + " ISX";
                hasisx = true;
            }
        }
    }
    if (!hasisx) {
        document.getElementById("balance").innerHTML = "- ISX";
    }
    document.getElementById("tabs").style.display = "block";
    // document.getElementById("balanceView").style.display = "block";
    document.getElementById('gotoCB').click();
    // document.getElementById("selection").style.display = "block";
    document.getElementById("connect").style.display = "none";
    displayClaimableBalances(knownassets);

    updateCounter();
}

async function displayClaimableBalances(knownassets) {

    const server = new StellarSdk.Server("https://horizon.stellar.org");

    let cbs = await server.claimableBalances().claimant(accountId).call();

    let sum = 0;
    let table = "<table>";
    let cl = 0;
    while (cbs.records.length > 0) {

        for (var r of cbs.records) {
            if (!knownassets.includes(r.asset)) {

                for (let c of r.claimants) {
                    if (c.destination == accountId) {
                        if (canClaim(c.predicate)) {
                            cl++;
                            let cssclass = "row" + (cl % 2);
                            // console.log(r.id)
                            table += `<tr class="${cssclass}">`;
                            table += `<td><input type="checkbox" id="${r.id}" value="${r.id}" checked/></td><td>${r.amount}</td><td>${r.asset.split(":")[0]}</td>`;
                            table += "</tr>";

                            //     sum += Number(dest);
                            // }

                        }
                    }
                }
            }
        }

        cbs = await cbs.next();
    }
    if (cl <= 0) {
        table += `<tr >`;
        table += `<td>No claimable balances to zap</td><td></td><td></td>`;
        table += "</tr>";
    }
    table += "</table>";
    document.getElementById("cbList").innerHTML = table;

    var checkboxes = document.querySelectorAll('input[type=checkbox]')
    for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].disabled = true;
        checkboxes[i].checked = true;
        checkboxes[i].addEventListener("change", checkCBAmount);
    }

    checkCBAmount()
}


async function checkCBAmount() {

    document.getElementById("cbAmount").innerHTML = "...";
    document.getElementById("zapbuttoncb").disabled = true;
    const server = new StellarSdk.Server("https://horizon.stellar.org");

    var sum = 0;
    var paths = [];
    var checkboxes = document.querySelectorAll('input[type=checkbox]:checked')
    let max = checkboxes.length
    if (checkboxes.length > 25) {
        max = 25;
        document.getElementById("transaction").innerHTML = "Cannot convert more than 25 claimable balances";
    }
    for (var i = 0; i < max; i++) {
        let id = checkboxes[i].value;
        let cb = await server.claimableBalances().claimableBalance(id).call();

        let asset = await server.assets().forCode(cb.asset.split(":")[0]).forIssuer(cb.asset.split(":")[1]).call();
        let authRequired = true;
        if (asset && asset.records.length == 1) {
            authRequired = asset.records[0].flags.auth_required;
        }

        let path = await findPath(cb.amount, cb.asset);
        if (!authRequired && Number(path.destination_amount) > 0) {
            paths.push({
                id: cb.id,
                asset: new StellarSdk.Asset(cb.asset.split(":")[0], cb.asset.split(":")[1]),
                paths: path
            });
            sum += Number(path.destination_amount);
            checkboxes[i].disabled = false;
        } else {
            checkboxes[i].checked = false;
            checkboxes[i].disabled = true;
        }
    }
    document.getElementById("cbAmount").innerHTML = sum.toFixed(7);
    document.getElementById("zapbuttoncb").disabled = false;
    return paths;
}

async function findPath(amount, assetstr) {

    if (assetstr.includes(":")) {

        let srcAsset = new StellarSdk.Asset(assetstr.split(":")[0], assetstr.split(":")[1]);
        const server = new StellarSdk.Server("https://horizon.stellar.org");

        let path = await server.strictSendPaths(srcAsset, amount, [ISX]).call();
        if (path.records.length > 0) {
            // console.log(path.records[0])
            return path.records[0];
        }
    }

    return {};
}

function computeAmountToZap() {

    let pct = document.getElementById("slider").value;
    document.getElementById("slidervalue").innerHTML = pct + " %";
    // console.log(isxbalance)
    // console.log(pct)
    // console.log(parseFloat(pct))
    let toZap = (isxbalance * parseFloat(pct) / 100).toFixed(7);
    // console.log("ISX to zap: " + toZap)

    document.getElementById("zapvalue").value = toZap;

    return toZap;
}

function updateSlider() {
    let inputValue = parseFloat(document.getElementById("zapvalue").value);
    if (inputValue) {
        if (inputValue > isxbalance) {
            inputValue = isxbalance;
            document.getElementById("zapvalue").value = isxbalance;
        }
        let pct = inputValue / isxbalance * 100;
        document.getElementById("slider").value = pct;
        document.getElementById("slidervalue").innerHTML = pct.toFixed(2) + " %";
    } else {

    }
}

function zapBalance() {

    let amount = document.getElementById("zapvalue").value;

    if (parseFloat(amount) > 0) {

        (
            async (amount) => {
                var memo = StellarSdk.Memo.text("Zap");
                var maxFee = 10000;
                var server = new StellarSdk.Server("https://horizon.stellar.org")
                var account = await server.loadAccount(accountId);
                var passPhrase = StellarSdk.Networks.PUBLIC;
                var txBuilder = new StellarSdk.TransactionBuilder(account, {
                    memo: memo,
                    fee: maxFee,
                    networkPassphrase: passPhrase
                });

                txBuilder = txBuilder.addOperation(StellarSdk.Operation.payment({
                    amount: amount,
                    destination: ISX.issuer,
                    asset: ISX
                }));

                var transaction = txBuilder.setTimeout(300).build();

                // console.log(transaction.toXDR())

                const unsignedXdr = transaction.toXDR();

                const signWindow = window.open(
                    `https://sign.plutodao.finance/sign?xdr=${unsignedXdr}`,
                    'Sign_Window',
                    'width=360, height=700',
                );
            }
        )(amount)
    }
}

async function zapCB() {

    let paths = await checkCBAmount();

    if (paths.length > 0 && paths.length <= (100 / 4)) {

        var memo = StellarSdk.Memo.text("Zap");
        var maxFee = 10000;
        var server = new StellarSdk.Server("https://horizon.stellar.org")
        var account = await server.loadAccount(accountId);
        var passPhrase = StellarSdk.Networks.PUBLIC;
        var txBuilder = new StellarSdk.TransactionBuilder(account, {
            memo: memo,
            fee: maxFee,
            networkPassphrase: passPhrase
        });

        let groups = [];
        let count = 0;
        paths.forEach(path => {

            let assetPath = path.paths.path.map(a => {
                if (a.asset_type == "native") {
                    return StellarSdk.Asset.native()
                }
                return new StellarSdk.Asset(a.asset_code, a.asset_issuer)
            })
            let destmin = (parseFloat(path.paths.destination_amount) / 2).toFixed(7);

            txBuilder = txBuilder.addOperation(StellarSdk.Operation.changeTrust({
                asset: path.asset
            })).addOperation(StellarSdk.Operation.claimClaimableBalance({
                balanceId: path.id,
            })).addOperation(StellarSdk.Operation.pathPaymentStrictSend({
                sendAmount: path.paths.source_amount,
                sendAsset: path.asset,
                destMin: destmin,
                destination: ISX.issuer,
                destAsset: ISX,
                path: assetPath
            })).addOperation(StellarSdk.Operation.changeTrust({
                asset: path.asset,
                limit: "0"
            }));
            groups.push({
                from: count,
                to: count + 3,
                title: "Convert " + path.asset.code + " to ISX and zap it"
            })
            count += 4;
        })

        var transaction = txBuilder.setTimeout(300).build();

        // console.log(transaction.toXDR())

        const unsignedXdr = transaction.toXDR();

        const signWindow = window.open(
            `https://sign.plutodao.finance/sign`,
            'Sign_Window',
            'width=360, height=700',
        );
        const now = Date.now();
        window.addEventListener('message', (e) => {

            console.log("check " + now);
            if (
                e.origin === simpleSignerUrl &&
                e.data.type === 'onReady' &&
                e.data.page === 'sign'
            ) {
                signWindow.postMessage(
                    {
                        xdr: unsignedXdr,
                        description: 'Zapping',
                        operationGroups: groups,
                    },
                    simpleSignerUrl,
                );
            }
        }, { once: true });
    }
}

// see https://developer.mozilla.org/en-US/docs/Web/API/Window/message_event
window.addEventListener('message', handleMessage);
document.getElementById("connect").addEventListener("click", openConnectWindow)
document.getElementById("slider").addEventListener("input", computeAmountToZap)
document.getElementById("zapvalue").addEventListener("input", updateSlider)
document.getElementById("zapbutton").addEventListener("click", zapBalance)
document.getElementById("zapbuttoncb").addEventListener("click", zapCB)
document.getElementById("slider").value = 0;
document.getElementById("zapvalue").value = 0;

document.getElementById("gotoBalance").addEventListener("click", () => {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById("gotoBalance").className += " active";
    document.getElementById("balanceView").style.display = "block";
});
document.getElementById("gotoCB").addEventListener("click", () => {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById("gotoCB").className += " active";
    document.getElementById("cbView").style.display = "block";
});

async function updateCounter ()  {

    let server = new StellarSdk.Server("https://horizon.stellar.org");
    let response = await server.assets().forCode("ISX").forIssuer("GBPB3G2LWSCUSGJTAUHRKOGBSXFDGDOHRGY5QXISNMWQEY6PDLY3YCD6").call();
    if (response.records.length == 1) {
        let isx = response.records[0];
        let initial = 500000000;
        let current = Number(isx.amount) + Number(isx.claimable_balances_amount) + Number(isx.liquidity_pools_amount);
        let zapped = initial - current;

        document.getElementById("zapcontent").innerHTML = `<span id="zapped">${Intl.NumberFormat().format(zapped)}</span> ISX zapped `;
    }
}

updateCounter();
setInterval(updateCounter, 60000);