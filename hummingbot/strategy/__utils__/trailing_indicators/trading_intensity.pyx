# distutils: language=c++
# distutils: sources=hummingbot/core/cpp/OrderBookEntry.cpp

import warnings
from decimal import Decimal
from typing import (
    Tuple, List,
)

import numpy as np
from cython.operator cimport(
    address,
    dereference as deref,
    postincrement as inc,
)
from libcpp.set cimport set
from scipy.optimize import curve_fit
from scipy.optimize import OptimizeWarning

from hummingbot.core.data_type.order_book_row import OrderBookRow

cdef class TradingIntensityIndicator:

    def __init__(self, sampling_length: int = 30):
        self._alpha = 0
        self._kappa = 0
        self._trades = []
        self._sampling_length = sampling_length
        self._samples_length = 0

        warnings.simplefilter("ignore", OptimizeWarning)

    cdef c_simulate_execution(
        self, set[OrderBookEntry] bid_book, set[OrderBookEntry] ask_book
    ):
        cdef:
            set[OrderBookEntry].reverse_iterator ob_ri_prev
            set[OrderBookEntry].iterator ob_i_prev
            double price_prev
            double bid
            double bid_amount
            double ask
            double ask_amount
            double bid_prev
            double bid_amount_prev
            double ask_prev
            double ask_amount_prev
            double trade_price_level
            double trade_amount
            list trades

        # Estimate market orders that happened
        # Assume every movement in the BBO is caused by a market order and its size is the volume differential

        bid = deref(bid_book.rbegin()).getPrice()
        bid_amount = deref(bid_book.rbegin()).getAmount()
        ask = deref(ask_book.begin()).getPrice()
        ask_amount = deref(ask_book.begin()).getAmount()

        bid_prev = deref(deref(self._bid_book).rbegin()).getPrice()
        ask_prev = deref(deref(self._ask_book).begin()).getPrice()
        price_prev = (bid_prev + ask_prev) / 2

        trades = []

        # Higher bids were filled - someone matched them - a determined seller
        # Equal bids - if amount lower - partially filled
        ob_ri_prev = deref(self._bid_book).rbegin()
        while ob_ri_prev != deref(self._bid_book).rend():
            bid_prev = deref(ob_ri_prev).getPrice()
            bid_amount_prev = deref(ob_ri_prev).getAmount()
            if bid_prev < bid:
                break
            elif bid_prev == bid:
                if bid_amount < bid_amount_prev:
                    trade_amount = bid_amount_prev - bid_amount
                    trade_price_level = abs(bid_prev - price_prev)
                    trades.append({"price_level": trade_price_level, "amount": trade_amount})
            else:
                trade_amount = bid_amount_prev
                trade_price_level = abs(bid_prev - price_prev)
                trades.append({"price_level": trade_price_level, "amount": trade_amount})
            inc(ob_ri_prev)

        # Lower asks were filled - someone matched them - a determined buyer
        # Equal asks - if amount lower - partially filled
        ob_i_prev = deref(self._ask_book).begin()
        while ob_i_prev != deref(self._ask_book).end():
            ask_prev = deref(ob_i_prev).getPrice()
            ask_amount_prev = deref(ob_i_prev).getAmount()
            if ask_prev < ask:
                break
            elif ask_prev == ask:
                if ask_amount < ask_amount_prev:
                    trade_amount = ask_amount_prev - ask_amount
                    trade_price_level = abs(ask_prev - price_prev)
                    trades.append({"price_level": trade_price_level, "amount": trade_amount})
            else:
                trade_amount = ask_amount_prev
                trade_price_level = abs(ask_prev - price_prev)
                trades.append({"price_level": trade_price_level, "amount": trade_amount})
            inc(ob_i_prev)

        # Add trades
        self._trades += [trades]
        self._trades = self._trades[-self._sampling_length:]

    def _estimate_intensity(self):
        self.c_estimate_intensity()

    cdef c_estimate_intensity(self):
        cdef:
            dict trades_consolidated
            list lambdas
            list price_levels

        # Calculate lambdas / trading intensities
        lambdas = []

        trades_consolidated = {}
        price_levels = []
        for tick in self._trades:
            for trade in tick:
                if trade['price_level'] not in trades_consolidated.keys():
                    trades_consolidated[trade['price_level']] = 0
                    price_levels += [trade['price_level']]

                trades_consolidated[trade['price_level']] += trade['amount']

        price_levels = sorted(price_levels, reverse=True)

        for price_level in price_levels:
            lambdas += [trades_consolidated[price_level]]

        # Adjust to be able to calculate log
        lambdas_adj = [10**-10 if x==0 else x for x in lambdas]

        # Fit the probability density function; reuse previously calculated parameters as initial values
        try:
            params = curve_fit(lambda t, a, b: a*np.exp(-b*t),
                               price_levels,
                               lambdas_adj,
                               p0=(self._alpha, self._kappa),
                               method='dogbox',
                               bounds=([0, 0], [np.inf, np.inf]))

            self._kappa = Decimal(str(params[0][1]))
            self._alpha = Decimal(str(params[0][0]))
        except (RuntimeError, ValueError) as e:
            pass

    def add_sample(self, bid_entries: List[OrderBookRow], ask_entries: List[OrderBookRow]):
        cdef:
            set[OrderBookEntry] bid_book
            set[OrderBookEntry] ask_book

        for e in bid_entries:
            bid_book.insert(OrderBookEntry(e.price, e.amount, e.update_id))
        for e in ask_entries:
            ask_book.insert(OrderBookEntry(e.price, e.amount, e.update_id))

        self.c_add_sample(bid_book, ask_book)

    cdef c_add_sample(self, set[OrderBookEntry] bid_book, set[OrderBookEntry] ask_book):
        if bid_book.size() == 0 or ask_book.size() == 0:
            return

        # Skip snapshots where no trades occurred
        if (
            self._bid_book != NULL
            and deref(self._bid_book).size() != 0
            and deref(bid_book.begin()) == deref(deref(self._bid_book).begin())
        ):
            return

        if (
            self._ask_book != NULL
            and deref(self._ask_book).size() != 0
            and deref(ask_book.begin()) == deref(deref(self._ask_book).begin())
        ):
            return

        # Retrieve previous order book, evaluate execution
        if (
            self._ask_book != NULL
            and deref(self._bid_book).size() != 0
            and self._bid_book != NULL
            and deref(self._ask_book).size() != 0
        ):
            self.c_simulate_execution(bid_book, ask_book)

        if self.is_sampling_buffer_full:
            # Estimate alpha and kappa
            self.c_estimate_intensity()

        # Store the orderbook
        self._bid_book = address(bid_book)
        self._ask_book = address(ask_book)

    @property
    def current_value(self) -> Tuple[float, float]:
        return self._alpha, self._kappa

    @property
    def is_sampling_buffer_full(self) -> bool:
        return len(self._trades) == self._sampling_length

    @property
    def is_sampling_buffer_changed(self) -> bool:
        is_changed = self._samples_length != len(self._trades)
        self._samples_length = len(self._trades)
        return is_changed

    @property
    def sampling_length(self) -> int:
        return self._sampling_length
