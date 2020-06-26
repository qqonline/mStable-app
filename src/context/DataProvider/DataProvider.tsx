import React, {
  createContext,
  FC,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { pipe } from 'ts-pipe-compose';
import useDebouncedMemo from '@sevenoutman/use-debounced-memo';

import { useLatestExchangeRateLazyQuery } from '../../graphql/generated';
import { useTokensState } from './TokensProvider';
import {
  RawData,
  PartialRawData,
  DataState,
  MassetState,
  SavingsContractState,
  BassetState,
} from './types';
import { recalculateState } from './recalculateState';
import { transformRawData } from './transformRawData';
import {
  useBlockPollingSubscription,
  useCreditBalancesSubscription,
  useMusdSubscription,
  useMusdSavingsSubscription,
} from './subscriptions';
import { BigDecimal } from '../../web3/BigDecimal';

const dataStateCtx = createContext<DataState | undefined>(undefined);

const setDataState = (data: PartialRawData): DataState | undefined => {
  if (data.mAsset && data.savingsContract) {
    return pipe<RawData, DataState, DataState>(
      data as RawData,
      transformRawData,
      recalculateState,
    );
  }
  return undefined;
};

const COINGECKO_ETH_USD_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

const useEtherPriceData = (): string | undefined => {
  const [etherPrice, setEtherPrice] = useState<string | undefined>();

  useEffect(() => {
    window.fetch(COINGECKO_ETH_USD_URL).then(res =>
      res.json().then(({ ethereum: { usd } }) => {
        setEtherPrice(usd);
      }),
    );
  }, [setEtherPrice]);

  return etherPrice;
};

const useRawData = (): PartialRawData => {
  const etherPrice = useEtherPriceData();
  const tokens = useTokensState();
  const mUsdSub = useMusdSubscription();
  const mUsdSavingsSub = useMusdSavingsSubscription();
  const creditBalancesSub = useCreditBalancesSubscription();
  const latestExchangeRateSub = useBlockPollingSubscription(
    useLatestExchangeRateLazyQuery,
  );

  const mAsset = mUsdSub.data?.masset || undefined;
  const savingsContract = mUsdSavingsSub.data?.savingsContracts[0];
  const creditBalances = creditBalancesSub.data?.account?.creditBalances;
  const latestExchangeRate = latestExchangeRateSub.data?.exchangeRates[0];

  return useDebouncedMemo(
    () => ({
      creditBalances,
      latestExchangeRate,
      mAsset,
      savingsContract,
      tokens,
      etherPrice,
    }),
    [
      tokens,
      mAsset,
      savingsContract,
      creditBalances,
      latestExchangeRate,
      etherPrice,
    ],
    500,
  );
};

export const DataProvider: FC<{}> = ({ children }) => {
  const data = useRawData();

  const dataState = useMemo<DataState | undefined>(() => setDataState(data), [
    data,
  ]);

  return (
    <dataStateCtx.Provider value={dataState}>{children}</dataStateCtx.Provider>
  );
};

export const useDataState = (): DataState | undefined =>
  useContext(dataStateCtx);

export const useMassetData = (): MassetState | undefined =>
  useDataState()?.mAsset;

export const useSavingsContractData = (): SavingsContractState | undefined =>
  useDataState()?.savingsContract;

export const useLatestExchangeRate = (): SavingsContractState['latestExchangeRate'] =>
  useSavingsContractData()?.latestExchangeRate;

export const useSavingsBalance = ():
  | SavingsContractState['savingsBalance']
  | undefined => useSavingsContractData()?.savingsBalance;

export const useMusdTotalSupply = (): BigDecimal | undefined =>
  useMassetData()?.totalSupply;

export const useTotalSavings = (): BigDecimal | undefined =>
  useDataState()?.savingsContract.totalSavings;

export const useBassetState = (address: string): BassetState | undefined =>
  useDataState()?.bAssets[address];

export const useEtherPrice = (): BigDecimal | undefined =>
  useDataState()?.etherPrice;
