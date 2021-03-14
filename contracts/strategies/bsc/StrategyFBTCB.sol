// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "../StrategyBase.sol";
import "../../interfaces/ISinglePlus.sol";
import "../../interfaces/fortube/IForTubeReward.sol";
import "../../interfaces/fortube/IForTubeBank.sol";
import "../../interfaces/uniswap/IUniswapRouter.sol";

/**
 * @dev Earning strategy for ForTube BTCB
 */
contract StrategyFBTCB is StrategyBase {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    address public constant BTCB = address(0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c);
    address public constant WBNB = address(0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c);
    address public constant FOR = address(0x658A109C5900BC6d2357c87549B651670E5b0539);
    address public constant FORTUBE_BTCB = address(0xb5C15fD55C73d9BeeC046CB4DAce1e7975DcBBBc);
    address public constant FORTUBE_BANK = address(0x0cEA0832e9cdBb5D476040D58Ea07ecfbeBB7672);
    address public constant FORTUBE_REWARD = address(0x55838F18e79cFd3EA22Eea08Bd3Ec18d67f314ed);
    address public constant PANCAKE_SWAP_ROUTER = address(0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F);

    /**
     * @dev Initializes the strategy.
     */
    function initialize(address _plus) public initializer {
        require(ISinglePlus(_plus).token() == FORTUBE_BTCB, "not fBTCB");
        __StrategyBase_init(_plus);
    }

    /**
     * @dev Returns the amount of tokens managed by the strategy.
     */
    function balance() public view override returns (uint256) {
        return IERC20Upgradeable(FORTUBE_BTCB).balanceOf(address(this));
    }

    /**
     * @dev Withdraws a portional amount of assets from the Strategy.
     */
    function withdraw(uint256 _amount) public override onlyPlus {
        IERC20Upgradeable(FORTUBE_BTCB).safeTransfer(plus, _amount);
    }

    /**
     * @dev Withdraws all assets out of the Strategy.  Usually used in strategy migration.
     */
    function withdrawAll() public override onlyPlus returns (uint256) {
        uint256 _balance = IERC20Upgradeable(FORTUBE_BTCB).balanceOf(address(this));
        if (_balance > 0) {
            IERC20Upgradeable(FORTUBE_BTCB).safeTransfer(plus, _balance);
        }

        return _balance;
    }

    /**
     * @dev Invest the managed token in strategy to earn yield.
     */
    function deposit() public override onlyStrategist {
        // No op
    }

    /**
     * @dev Harvest in strategy.
     * Only pool can invoke this function.
     */
    function harvest() public override onlyStrategist {
        // Harvest from FurTube rewards
        IForTubeReward(FORTUBE_REWARD).claimReward();

        uint256 _for = IERC20Upgradeable(FOR).balanceOf(address(this));
        // PancakeSawp: FOR --> WBNB --> BTCB
        if (_for > 0) {
            IERC20Upgradeable(FOR).safeApprove(PANCAKE_SWAP_ROUTER, 0);
            IERC20Upgradeable(FOR).safeApprove(PANCAKE_SWAP_ROUTER, _for);

            address[] memory _path = new address[](3);
            _path[0] = FOR;
            _path[1] = WBNB;
            _path[2] = BTCB;

            IUniswapRouter(PANCAKE_SWAP_ROUTER).swapExactTokensForTokens(_for, uint256(0), _path, address(this), now.add(1800));
        }
        // ACrytoS: BTCB --> fBTCB
        uint256 _btcb = IERC20Upgradeable(BTCB).balanceOf(address(this));
        if (_btcb > 0) {
            IERC20Upgradeable(BTCB).safeApprove(FORTUBE_BANK, 0);
            IERC20Upgradeable(BTCB).safeApprove(FORTUBE_BANK, _for);
            IForTubeBank(FORTUBE_BANK).deposit(BTCB, _btcb);
        }
        uint256 _fBTCB = IERC20Upgradeable(FORTUBE_BTCB).balanceOf(address(this));
        if (_fBTCB == 0) {
            return;
        }
        uint256 _fee = 0;
        if (performanceFee > 0) {
            _fee = _fBTCB.mul(performanceFee).div(PERCENT_MAX);
            IERC20Upgradeable(FORTUBE_BTCB).safeTransfer(ISinglePlus(plus).treasury(), _fee);
        }
        deposit();

        emit Harvested(FORTUBE_BTCB, _fBTCB, _fee);
    }

    /**
     * @dev Checks whether a token can be salvaged via salvageToken(). The following two
     * tokens are not salvageable:
     * 1) fBTCB
     * 2) FOR
     * @param _token Token to check salvageability.
     */
    function _salvageable(address _token) internal view virtual override returns (bool) {
        return _token != FORTUBE_BTCB && _token != FOR;
    }
}