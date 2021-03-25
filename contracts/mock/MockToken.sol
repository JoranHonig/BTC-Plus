// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/**
 * @notice Mock ERC20 token.
 */
contract MockToken is ERC20Upgradeable {
    uint8 public override decimals;

    constructor (string memory _name, string memory _symbol, uint8 _decimals) public {
        __ERC20_init(name, symbol);
        decimals = _decimals;
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}