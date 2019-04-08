pragma solidity 0.4.24;
import "oraclize-api/contracts/usingOraclize.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract BitcoinPricePolicy is usingOraclize {
    
    using SafeMath for uint256;

    // The price threshold in USD Cents.
    uint public priceThresholdInUSCents;
    // When this flag is set to true, the policy will be violated when the median price goes above the threshold.
    // When this flag is set to false, the policy will be violated when the median price goes below the threshold.
    bool public isHigher;
    // The number of 3rd party oracles that are being used to get the price of Bitcoin.
    uint public oracleCount;
    // Queries to oracles that have not been answered yet will be set to true.
    mapping (bytes32 => bool) internal pendingQueries;
    // A mapping from oracle query ID to the index of the oracle in the arrays below.
    mapping (bytes32 => uint) internal queryIdToOracleIndex;
    // A list of URL queries for the latest Bitcoin prices for the different oracles.
    string[] public priceQueries;
    // This array stores the answeres of the oracles to the queries above.
    uint[] public bitcoinPrices;
    // This array stores the block when the last answer was given by the oracle at that index.
    uint[] public blockWhenComputedLastTime;
    // This is an auxiliary array used by the sorting function that is performed in-place.
    uint[] internal data;

    event LogPriceUpdated(string price, uint oracleIndex);
    event LogNewOraclizeQuery(string description, uint oracleIndex);

    /** This policy monitors the price of Bitcoin using multiple well-known oracles.
     * @param _priceThresholdInUSCents - Is the threshold for the price of Bitcoin, set by the policy owner.
     * @param _isHigher - A flag indicating the policy is violated if the actual price goes below the priceThreshold,
     * or (if set to false) it means that the policy is violated if the actual price goes above the priceThreshold.
     */
    constructor(uint _priceThresholdInUSCents, bool _isHigher) public payable {
        priceThresholdInUSCents = _priceThresholdInUSCents;
        isHigher = _isHigher;
        priceQueries.push("json(https://api.binance.com/api/v3/avgPrice?symbol=BTCUSDT).price");
        priceQueries.push("json(https://api.pro.coinbase.com/products/BTC-USD/ticker).price");
        priceQueries.push(strConcat("json(https://api.coindesk.com/v1/bpi/currentprice.json)",
                ".bpi.USD.rate_float"));
        priceQueries.push("json(https://blockchain.info/ticker).USD.last");
        priceQueries.push("json(https://www.bitstamp.net/api/ticker).last");
        priceQueries.push("json(https://bitbay.net/API/Public/BTCUSD/ticker.json).last");
        priceQueries.push(strConcat("html(https://coinmarketcap.com/currencies/bitcoin)",
                ".xpath(//*[contains(@class, 'h2 text-semi-bold details-panel-item--price__value')]/text())"));
        oracleCount = priceQueries.length;
        bitcoinPrices = new uint[](oracleCount);
        blockWhenComputedLastTime = new uint[](oracleCount);
    }

    /** This fallback function allows sending ETH to this contract which is needed for submitting all queries
     * solhint-disable no-empty-blocks
     */ 
    function () payable {
    }
    /* solhint-enable no-empty-blocks */
    
    /** This function returns true if the policy is violated and false otherwise.
     * @param candidateContract - An arbitrary address. This parameter is not used.
     */
    function isViolated(address candidateContract) external view returns(bool) {
        for (uint i = 0; i < oracleCount; i++) {
            if (blockWhenComputedLastTime[i] == 0)
                return false;
        }
        // if prices for all oracles are available, then compute median
        data = sort(bitcoinPrices);
        uint medianBtcUSCents = data[oracleCount.div(2).add(1)];
        return xor(medianBtcUSCents > priceThresholdInUSCents, isHigher);
    }

    /** This function is only callable by authorized Oraclize addresses.
     * @param myId - The oraclize query ID to be answered.
     * @param result - The current Bitcoin price given by the oracle.
     */
    function __callback(bytes32 myId, string result) public {
        if (msg.sender != oraclize_cbAddress()) revert();
        require(pendingQueries[myId] == true);
        uint oracleIndex = queryIdToOracleIndex[myId];
        bitcoinPrices[oracleIndex] = parseInt(result, 2);
        blockWhenComputedLastTime[oracleIndex] = block.number;
        emit LogPriceUpdated(result, oracleIndex);
        delete pendingQueries[myId]; // This effectively marks the query id as processed.
    }

    /** This function needs to be called before isViolated() in order to query the oracles.
     */
    function getAllPrices() public payable {
        for (uint i = 0; i < oracleCount; i++) {
            getPriceFromOracle(i);
        }
    }

    /** This function queries one oracle for the price of Bitcoin.
     * @param oracleIndex - The index of the oracle that should be queried.
     */
    function getPriceFromOracle(uint oracleIndex) internal {
        if (oraclize_getPrice("URL") > address(this).balance) {
            emit LogNewOraclizeQuery("Oraclize query was NOT sent, please add ETH to cover query fee", oracleIndex);
        } else {
            emit LogNewOraclizeQuery("Oraclize query was sent, standing by for the answer..", oracleIndex);
            bytes32 queryId = oraclize_query("URL", priceQueries[oracleIndex]);
            pendingQueries[queryId] = true;
            queryIdToOracleIndex[queryId] = oracleIndex;
        }
    }

    /** XOR function built using AND and OR operators. Since there is no XOR operator in Solidity.
     * @param a - Left-hand Boolean operand.
     * @param b - Right-hand Boolean operand.
     * @return A boolean value indicating the result of (a XOR b).
     */
    function xor(bool a, bool b) internal pure returns(bool) {
        return (a && !b) || (!a && b);
    }

    /** A function that sorts an array of integers.
     * @param _data - The input array to be sorted.
     * @return The output array which is sorted in ascending order.
     */
    function sort(uint[] _data) internal returns(uint[]) {
        data = _data;
        if (data.length == 0)
            return;
        quickSort(data, 0, data.length - 1);
        return data;
    }

    /** A recursive quick-sort function that sorts an array in place.
     * @param arr - The array to be sorted.
     * @param left - The lower index where sorting should start.
     * @param right - The higher index where sorting should stop.
     */
    function quickSort(uint[] storage arr, uint left, uint right) internal {
        uint i = left;
        uint j = right;
        uint pivot = arr[left + (right - left) / 2];
        while (i <= j) {
            while (arr[i] < pivot) i++;
            while (pivot < arr[j]) j--;
            if (i <= j) {
                (arr[i], arr[j]) = (arr[j], arr[i]);
                i++;
                j--;
            }
        }
        if (left < j)
            quickSort(arr, left, j);
        if (i < right)
            quickSort(arr, i, right);
    }
}