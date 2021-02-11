// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @title Interface for pool contract.
 * 
 * Each pool manages exactly one token which might be ERC20 BTC tokens or ERC20 BTC LP token.
 * It can optionally contain strategies to earn yield for the managed token.
 */
interface IPool {

    event StrategyListUpdated(address indexed _strategy, bool _approved);

    event ActiveStrategyUpdated(address indexed _oldActiveStrategy, address indexed _newActiveStrategy);

    /**
     * @dev Returns the address of the token managed by the pool.
     */
    function token() external view returns (address);

    /**
     * @dev Returns the total amount of tokens managed by the pool.
     */
    function balance() external view returns (uint256);

    /**
     * @dev Returns the total amount of ERC20 BTC tokens managed by the pool.
     * If the managed token is an ERC20 BTC token, then it's equal to balance().
     * If the managed token is an ERC20 BTC LP token, then it's equal to balance() * exchange rate.
     * E.g. For renCrv pool, underlyingBalance() = balance() * Curve Ren Pool.get_virtual_price().
     */
    function underlyingBalance() external view returns (uint256);

    /**
     * @dev Returns the amount of a specific underlying ERC20 BTC.
     * If the managed token is an ERC20 BTC token, it returns balance() when _token is the managed token and 0 otherwise.
     * If the managed token is an ERC20 BTC LP token, it returns the balance of each underlying ERC20 BTC that composes the LP token.
     */
    function underlyingBalanceOf(address _token) external view returns (uint256);

    /**
     * @dev Withdraws managed token from the pool. Only BTC+ can invoke this function.
     * @param _receiver Account to receive the token withdraw.
     * @param _amount Amount to withdraw.
     */
    function withdraw(address _receiver, uint256  _amount) external;
}