# distutils: language=c++

from libc.stdint cimport int64_t
from libcpp.set cimport set

from hummingbot.core.data_type.OrderBookEntry cimport OrderBookEntry

cdef class TradingIntensityIndicator:
    cdef:
        double _alpha
        double _kappa
        list _trades
        set[OrderBookEntry] *_bid_book
        set[OrderBookEntry] *_ask_book
        int _sampling_length
        int _samples_length

    cdef c_simulate_execution(self, set[OrderBookEntry] bid_book, set[OrderBookEntry] ask_book)
    cdef c_estimate_intensity(self)
    cdef c_add_sample(self, set[OrderBookEntry] bid_book, set[OrderBookEntry] ask_book)
