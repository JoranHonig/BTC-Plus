// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../../SinglePlus.sol";
import "../../interfaces/curve/ICurveFi.sol";
import "../../interfaces/curve/ICurveMinter.sol";
import "../../interfaces/curve/ICurveGauge.sol";
import "../../interfaces/uniswap/IUniswapRouter.sol";

/**
 * @dev Single plus for renCrv.
 */
contract ObtcCrvPlus is SinglePlus {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    address public constant CRV = address(0xD533a949740bb3306d119CC777fa900bA034cd52);  // CRV token
    address public constant MINTER = address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0); // Token minter
    address public constant UNISWAP = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);  // Uniswap RouterV2
    address public constant SUSHISWAP = address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F);    // Sushiswap RouterV2
    address public constant WETH = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2); // WETH token. Used for crv -> weth -> wbtc route
    address public constant WBTC = address(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599); // WBTC token. Used for crv -> weth -> wbtc route

    address public constant BOR = address(0x3c9d6c1C73b31c837832c72E04D3152f051fc1A9);
    address public constant OBTCCRV = address(0x2fE94ea3d5d4a175184081439753DE15AeF9d614);
    address public constant OBTCCRV_GAUGE = address(0x11137B10C210b579405c21A07489e28F3c040AB1); // obtcCrv gauge
    address public constant OBTC_DEPOSIT = address(0xd5BCf53e2C81e1991570f33Fa881c49EEa570C8D); // OBTC deposit

    /**
     * @dev Retrive the underlying assets from the investment.
     * Only governance or strategist can call this function.
     */
    function divest() public virtual override onlyStrategist {
        ICurveGauge _gauge = ICurveGauge(OBTCCRV_GAUGE);
        _gauge.withdraw(_gauge.balanceOf(address(this)));
    }

    /**
     * @dev Invest the underlying assets for additional yield.
     * Only governance or strategist can call this function.
     */
    function invest() public virtual override onlyStrategist {
        IERC20Upgradeable _token = IERC20Upgradeable(OBTCCRV);
        uint256 _balance = _token.balanceOf(address(this));
        if (_balance > 0) {
            _token.safeApprove(OBTCCRV_GAUGE, 0);
            _token.safeApprove(OBTCCRV_GAUGE, _balance);
            ICurveGauge(OBTCCRV_GAUGE).deposit(_balance);
        }
    }

    /**
     * @dev Harvest additional yield from the investment.
     * Only governance or strategist can call this function.
     */
    function harvest() public virtual override onlyStrategist {
        // Step 1: Claims CRV from Curve
        ICurveMinter(MINTER).mint(OBTCCRV_GAUGE);
        uint256 _crv = IERC20Upgradeable(CRV).balanceOf(address(this));

        // Step 2: Sushiswap CRV --> WETH --> WBTC
        if (_crv > 0) {
            IERC20Upgradeable(CRV).safeApprove(SUSHISWAP, 0);
            IERC20Upgradeable(CRV).safeApprove(SUSHISWAP, _crv);

            address[] memory _path = new address[](3);
            _path[0] = CRV;
            _path[1] = WETH;
            _path[2] = WBTC;

            IUniswapRouter(SUSHISWAP).swapExactTokensForTokens(_crv, uint256(0), _path, address(this), now.add(1800));
        }

        // Step 3: Claims BOR rewards
        ICurveGauge(OBTCCRV_GAUGE).claim_rewards();
        uint256 _bor = IERC20Upgradeable(BOR).balanceOf(address(this));

        // Step 4: Sushiswap BOR --> WETH --> WBTC
        if (_bor > 0) {
            IERC20Upgradeable(BOR).safeApprove(SUSHISWAP, 0);
            IERC20Upgradeable(BOR).safeApprove(SUSHISWAP, _bor);

            address[] memory _path = new address[](3);
            _path[0] = BOR;
            _path[1] = WETH;
            _path[2] = WBTC;

            IUniswapRouter(SUSHISWAP).swapExactTokensForTokens(_bor, uint256(0), _path, address(this), now.add(1800));
        }

        // Step 5: Curve WBTC --> obtcCrv
        uint256 _wbtc = IERC20Upgradeable(WBTC).balanceOf(address(this));
        if (_wbtc == 0) return;

        // If there is performance fee, charged in WBTC
        uint256 _fee = 0;
        if (performanceFee > 0) {
            _fee = _wbtc.mul(performanceFee).div(PERCENT_MAX);
            IERC20Upgradeable(WBTC).safeTransfer(treasury, _fee);
            _wbtc = _wbtc.sub(_fee);
        }

        IERC20Upgradeable(WBTC).safeApprove(OBTC_DEPOSIT, 0);
        IERC20Upgradeable(WBTC).safeApprove(OBTC_DEPOSIT, _wbtc);
        ICurveFi(OBTC_DEPOSIT).add_liquidity([0, 0, _wbtc, 0], 0);

        // Reinvest to get compound yield
        invest();
        // Also it's a good time to rebase!
        rebase();

        emit Harvested(OBTCCRV, _wbtc, _fee);
    }

    /**
     * @dev Checks whether a token can be salvaged via salvageToken(). The following two
     * tokens are not salvageable:
     * 1) renCrv
     * 2) WBTC
     * 3) CRV
     * @param _token Token to check salvageability.
     */
    function _salvageable(address _token) internal view virtual override returns (bool) {
        return _token != OBTCCRV && _token != WBTC && _token != CRV;
    }

    /**
     * @dev Returns the amount of single plus token is worth for one underlying token, expressed in WAD.
     */
    function _conversionRate() internal view virtual override returns (uint256) {
        // Curve's LP virtual price is in WAD
        return ICurveFi(OBTC_DEPOSIT).get_virtual_price();
    }

    /**
     * @dev Returns the total value of the underlying token in terms of the peg value, scaled to 18 decimals.
     */
    function _totalUnderlying() internal view virtual override returns (uint256) {
        uint256 _balance = IERC20Upgradeable(OBTCCRV).balanceOf(address(this));
        _balance = _balance.add(ICurveGauge(OBTCCRV_GAUGE).balanceOf(address(this)));

        // Conversion rate is the amount of single plus token per underlying token, in WAD.
        return _balance.mul(_conversionRate()).div(WAD);
    }

    /**
     * @dev Withdraws underlying tokens.
     * @param _receiver Address to receive the token withdraw.
     * @param _amount Amount of underlying token withdraw.
     */
    function _withdraw(address _receiver, uint256  _amount) internal virtual override {
        IERC20Upgradeable _token = IERC20Upgradeable(OBTCCRV);
        uint256 _balance = _token.balanceOf(address(this));
        if (_balance < _amount) {
            ICurveGauge(OBTCCRV_GAUGE).withdraw(_amount.sub(_balance));
            // In case of rounding errors
            _amount = MathUpgradeable.min(_amount, _token.balanceOf(address(this)));
        }
        _token.safeTransfer(_receiver, _amount);
    }
}