// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "../interfaces/IPlus.sol";

/**
 * @title Plus token base contract.
 *
 * Plus token is a value pegged ERC20 token which provides global interest to all holders.
 * It can be categorized as single plus token and composite plus token:
 * 
 * Single plus token is backed by one ERC20 token and targeted at yield generation.
 * Composite plus token is backed by a basket of ERC20 token and targeted at better basket management.
 */
abstract contract Plus is ERC20Upgradeable, IPlus {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    event Rebased(uint256 oldIndex, uint256 newIndex, uint256 totalUnderlying);
    event Donated(address indexed account, uint256 amount, uint256 share);

    event GovernanceUpdated(address indexed oldGovernance, address indexed newGovernance);
    event StrategistUpdated(address indexed strategist, bool allowed);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event RedeemFeeUpdated(uint256 oldFee, uint256 newFee);
    event MintPausedUpdated(address indexed token, bool paused);

    uint256 public constant MAX_PERCENT = 10000; // 0.01%
    uint256 public constant WAD = 1e18;

    /**
     * @dev Struct to represent a rebase hook.
     */
    struct Transaction {
        bool enabled;
        address destination;
        bytes data;
    }
    // Rebase hooks
    Transaction[] public transactions;

    uint256 public totalShares;
    mapping(address => uint256) public userShare;
    // The exchange rate between total shares and BTC+ total supply. Express in WAD.
    // It's equal to the amount of plus token per share.
    // Note: The index will never decrease!
    uint256 public index;

    address public override governance;
    mapping(address => bool) public override strategists;
    address public override treasury;

    // Governance parameters
    uint256 public redeemFee;

    /**
     * @dev Initializes the plus token contract.
     */
    function __PlusToken__init(string memory _name, string memory _symbol) internal initializer {
        __ERC20_init(_name, _symbol);
        index = WAD;
        governance = msg.sender;
        treasury = msg.sender;
    }

    function _checkGovernance() internal view {
        require(msg.sender == governance, "not governance");
    }

    modifier onlyGovernance() {
        _checkGovernance();
        _;
    }

    function _checkStrategist() internal view {
        require(msg.sender == governance || strategists[msg.sender], "not strategist");
    }

    modifier onlyStrategist {
        _checkStrategist();
        _;
    }

    /**
     * @dev Returns the total value of the plus token in terms of the peg value.
     * All underlying token amounts have been scaled to 18 decimals.
     * For single plus, it's equal to its total supply.
     * For composite plus, it's equal to the total amount of single plus tokens in its basket.
     */
    function _totalUnderlying() internal view virtual returns (uint256);

    /**
     * @dev Returns the value of the plus token in terms of the peg value.
     * All underlying token amounts have been scaled to 18 decimals.
     * For single plus, it's equal to its total supply.
     * For composite plus, it's equal to the total amount of single plus tokens in its basket.
     * @param _amount The amount of plus token to get underlying value.
     */
    function underlying(uint256 _amount) external view override returns (uint256) {
        uint256 _totalSupply = totalSupply();

        return _totalSupply == 0 ? 0 : _totalUnderlying().mul(_amount).div(_totalSupply);
    }

    /**
     * @dev Returns the total value of the plus token in terms of the peg value.
     */
    function totalUnderlying() external view override returns (uint256) {
        return _totalUnderlying();
    }

    /**
     * @dev Returns the total supply of plus token. See {IERC20Updateable-totalSupply}.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return totalShares.mul(index).div(WAD);
    }

    /**
     * @dev Returns the balance of plus token for the account. See {IERC20Updateable-balanceOf}.
     */
    function balanceOf(address account) public view virtual override returns (uint256) {
        return userShare[account].mul(index).div(WAD);
    }

    /**
     * @dev Returns the current liquidity ratio of the plus token in WAD.
     */
    function liquidityRatio() public view returns (uint256) {
        uint256 _totalSupply = totalSupply();
        return _totalSupply == 0 ? WAD : _totalUnderlying().mul(WAD).div(_totalSupply);
    }

    /**
     * @dev Accrues interest to increase index.
     */
    function rebase() public {
        uint256 _underlying = _totalUnderlying();
        uint256 _supply = totalSupply();
        // _underlying - _supply is the interest generated and should be distributed via rebase.
        // _supply might be larger than _underlying in a short period of time after rebalancing in composite plus.
        if (_underlying > _supply) {
            uint256 _oldIndex = index;
            // Index can never decrease
            uint256 _newIndex = _underlying.mul(WAD).div(totalShares);
            index = _newIndex;

            for (uint256 i = 0; i < transactions.length; i++) {
                Transaction storage transaction = transactions[i];
                if (transaction.enabled) {
                    (bool success, ) = transaction.destination.call(transaction.data);
                    require(success, "rebase hook failed");
                }
            }
            // Interest generated can be computed as _underlying - _underlying * _oldIndex / _newIndex
            emit Rebased(_oldIndex, _newIndex, _underlying);
        }
    }

    /**
     * @dev Allows anyone to donate their plus asset to all other holders.
     * @param _amount Amount of plus token to donate.
     */
    function donate(uint256 _amount) public {
        // Rebase first to make index up-to-date
        rebase();
        // Special handling of -1 is required here in order to fully donate all shares, since interest
        // will be accrued between the donate transaction is signed and mined.
        uint256 _share;
        if (_amount == uint256(-1)) {
            _share = userShare[msg.sender];
            _amount = _share.mul(index).div(WAD);
        } else {
            _share  = _amount.mul(WAD).div(index);
        }

        userShare[msg.sender] = userShare[msg.sender].sub(_share, "insufficient share");
        totalShares = totalShares.sub(_share);

        emit Donated(msg.sender, _amount, _share);
    }

    /**
     * @dev Moves tokens `amount` from `sender` to `recipient`.
     */
    function _transfer(address _sender, address _recipient, uint256 _amount) internal virtual override {
        // Rebase first to make index up-to-date
        rebase();
        uint256 _shareToTransfer = _amount.mul(WAD).div(index);
        userShare[_sender] = userShare[_sender].sub(_shareToTransfer, "insufficient share");
        userShare[_recipient] = userShare[_recipient].add(_shareToTransfer);
    }

    /*********************************************
     *
     *    Governance methods
     *
     **********************************************/

    /**
     * @dev Updates governance. Only governance can update governance.
     */
    function setGovernance(address _governance) external onlyGovernance {
        address _oldGovernance = governance;
        governance = _governance;
        emit GovernanceUpdated(_oldGovernance, _governance);
    }

    /**
     * @dev Updates strategist. Both governance and strategists can update strategist.
     */
    function setStrategist(address _strategist, bool _allowed) external onlyStrategist {
        require(_strategist != address(0x0), "strategist not set");

        strategists[_strategist] = _allowed;
        emit StrategistUpdated(_strategist, _allowed);
    }

    /**
     * @dev Updates the treasury. Only governance can update treasury.
     */
    function setTreasury(address _treasury) external onlyGovernance {
        require(_treasury != address(0x0), "treasury not set");

        address _oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(_oldTreasury, _treasury);
    }

    /**
     * @dev Updates the redeem fee. Only governance can update redeem fee.
     */
    function setRedeemFee(uint256 _redeemFee) external onlyGovernance {
        require(_redeemFee <= MAX_PERCENT, "redeem fee too big");
        uint256 _oldFee = redeemFee;

        redeemFee = _redeemFee;
        emit RedeemFeeUpdated(_oldFee, _redeemFee);
    }

    /**
     * @dev Used to salvage any ETH deposited to BTC+ contract by mistake. Only strategist can salvage ETH.
     * The salvaged ETH is transferred to treasury for futher operation.
     */
    function salvage() external onlyStrategist {
        uint256 _amount = address(this).balance;
        address payable _target = payable(treasury);
        (bool success, ) = _target.call{value: _amount}(new bytes(0));
        require(success, 'ETH salvage failed');
    }

    /**
     * @dev Checks whether a token can be salvaged via salvageToken().
     * @param _token Token to check salvageability.
     */
    function _salvageable(address _token) internal view virtual returns (bool);

    /**
     * @dev Used to salvage any token deposited to plus contract by mistake. Only strategist can salvage token.
     * The salvaged token is transferred to treasury for futhuer operation.
     * @param _token Address of the token to salvage.
     */
    function salvageToken(address _token) external onlyStrategist {
        require(_token != address(0x0), "token not set");
        require(_salvageable(_token), "cannot salvage");

        IERC20Upgradeable _target = IERC20Upgradeable(_token);
        _target.safeTransfer(treasury, _target.balanceOf(address(this)));
    }

    /**
     * @dev Add a new rebase hook.
     * @param _destination Destination contract for the reabase hook.
     * @param _data Transaction payload for the rebase hook.
     */
    function addTransaction(address _destination, bytes memory _data) external onlyGovernance {
        transactions.push(Transaction({enabled: true, destination: _destination, data: _data}));
    }

    /**
     * @dev Remove a rebase hook.
     * @param _index Index of the transaction to remove.
     */
    function removeTransaction(uint256 _index) external onlyGovernance {
        require(_index < transactions.length, "index out of bounds");

        if (_index < transactions.length - 1) {
            transactions[_index] = transactions[transactions.length - 1];
        }

        transactions.pop();
    }

    /**
     * @dev Updates an existing rebase hook transaction.
     * @param _index Index of transaction. Transaction ordering may have changed since adding.
     * @param _enabled True for enabled, false for disabled.
     */
    function updateTransaction(uint256 _index, bool _enabled) external onlyGovernance {
        require(_index < transactions.length, "index must be in range of stored tx list");
        transactions[_index].enabled = _enabled;
    }

    /**
     * @dev Returns the number of rebase hook transactions.
     */
    function transactionSize() external view returns (uint256) {
        return transactions.length;
    }
}