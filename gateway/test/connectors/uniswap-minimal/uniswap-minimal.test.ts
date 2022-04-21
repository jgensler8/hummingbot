jest.useFakeTimers();
import { BigNumber } from 'ethers';
import { Token } from '@uniswap/sdk'
import { Contract } from '@ethersproject/contracts';
import { humanDecimalToTokenNumber, newFakeTrade, UniswapMinimal } from '../../../src/connectors/uniswap-minimal/uniswap-minimal';

// jest.mock('@ethersproject/contracts')

describe('harmony', () => {
    let base: Token;
    let quote: Token;

    beforeAll(() => {
        base = new Token(123, "0x1111111111111111111111111111111111111111", 12, "A", "Token A")
        quote = new Token(123, "0x2222222222222222222222222222222222222222", 6, "B", "Token B")
    })

    afterAll(() => {
        jest.useRealTimers();
    })

    describe('getFakeTrade', () => {
        it('should return fake trade', () => {
            let tokenInAmount = humanDecimalToTokenNumber(base, BigNumber.from(3))
            let tokenOutAmount = humanDecimalToTokenNumber(quote, BigNumber.from(12))

            let in_to_out = newFakeTrade(base, quote, tokenInAmount, tokenOutAmount)
            expect(in_to_out.executionPrice.toSignificant()).toEqual("4")
            let out_to_in = newFakeTrade(quote, base, tokenOutAmount, tokenInAmount)
            expect(out_to_in.executionPrice.toSignificant()).toEqual("0.25")
        })
    })

    describe('getSwapIn and getSwapOut', () => {
        let contractMock: Contract;

        beforeAll(() => {
            let mockFactory = jest.fn().mockImplementation(() => {
                let bigZero = BigNumber.from(0)
                // assume tokenIn is worth less than tokenOut at a ratio of 4 to 1
                let priceRatio = "4"
                return {
                    getAmountsOut: (tokenNumber: string, pair: string[]) => {
                        let bigTokenAmount = BigNumber.from(tokenNumber)
                        if(pair[0] === base.address) {
                            // tokenNumer is a tokenIn amount
                            let tokenMorePlaces = bigTokenAmount.mul(BigNumber.from(10).pow(quote.decimals))
                            let tokenFewerPlaces = tokenMorePlaces.div(BigNumber.from(10).pow(base.decimals))
                            let outTokenNumber = tokenFewerPlaces.div(priceRatio)
                            return [bigTokenAmount, outTokenNumber]
                        }
                        else if (pair[0] === quote.address) {
                            // tokenNumer is a tokenOut amount
                            let tokenMorePlaces = bigTokenAmount.mul(BigNumber.from(10).pow(base.decimals))
                            let tokenFewerPlaces = tokenMorePlaces.div(BigNumber.from(10).pow(quote.decimals))
                            let outTokenNumber = tokenFewerPlaces.mul(priceRatio)
                            return [bigTokenAmount, outTokenNumber]
                        }
                        return [bigZero, bigZero]
                    },
                    getAmountsIn: (tokenNumber: string, pair: string[]) => {
                        let bigTokenAmount = BigNumber.from(tokenNumber)
                        if(pair[1] === base.address) {
                            // tokenNumber is a tokenIn amount
                            let tokenMorePlaces = bigTokenAmount.div(BigNumber.from(10).pow(base.decimals))
                            let tokenFewerPlaces = tokenMorePlaces.mul(BigNumber.from(10).pow(quote.decimals))
                            let outTokenNumber = tokenFewerPlaces.mul(priceRatio)
                            return [outTokenNumber, bigTokenAmount]
                        }
                        else if (pair[1] === quote.address) {
                            // tokenNumber is a tokenOut amount
                            let tokenMorePlaces = bigTokenAmount.div(BigNumber.from(10).pow(quote.decimals))
                            let tokenFewerPlaces = tokenMorePlaces.mul(BigNumber.from(10).pow(base.decimals))
                            let outTokenNumber = tokenFewerPlaces.div(priceRatio)
                            return [outTokenNumber, bigTokenAmount]
                        }
                        return [bigZero, bigZero]
                    },
                }
            })
            contractMock = mockFactory()
        })

        
        //
        // assume base is worth less than quote at a ratio of 4 to 1
        //
        it(`should return a valid SELL order for base`, async () => {
            // maximum output for 2 base tokens
            let res = await UniswapMinimal.estimateSellTrade(contractMock, base, quote, humanDecimalToTokenNumber(base, BigNumber.from(2)))
            if (typeof res === "string") {
                fail()
            }
            expect(res.expectedAmount.toSignificant()).toEqual("0.5")
            expect(res.trade.executionPrice.toSignificant()).toEqual("0.25")
        });
        it(`should return a valid SELL order for quote`, async () => {
            // maximum output for 2 quote tokens
            let res = await UniswapMinimal.estimateSellTrade(contractMock, quote, base, humanDecimalToTokenNumber(quote, BigNumber.from(2)))
            if (typeof res === "string") {
                fail()
            }
            expect(res.expectedAmount.toSignificant()).toEqual("8")
            expect(res.trade.executionPrice.toSignificant()).toEqual("4")
        })
        it(`should return a valid BUY order for base`, async () => {
            // minimum input to receive 2 quote tokens
            let res = await UniswapMinimal.estimateBuyTrade(contractMock, base, quote, humanDecimalToTokenNumber(quote, BigNumber.from(2)))
            if (typeof res === "string") {
                fail()
            }
            expect(res.expectedAmount.toSignificant()).toEqual("0.5")
            expect(res.trade.executionPrice.toSignificant()).toEqual("4")
        })
        it(`should return a valid BUY order for quote`, async () => {
            // minimum input to receive 2 base tokens
            let res = await UniswapMinimal.estimateBuyTrade(contractMock, quote, base, humanDecimalToTokenNumber(base, BigNumber.from(2)))
            if (typeof res === "string") {
                fail()
            }
            expect(res.expectedAmount.toSignificant()).toEqual("8")
            expect(res.trade.executionPrice.toSignificant()).toEqual("0.25")
        })
    })
});
