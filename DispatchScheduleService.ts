import { BaseService } from '../../../../../core/services/BaseServices';
import { AxiosPromise } from 'axios';
import genericService from '../../../../../core/services/GenericService';

class DispatchScheduleService extends BaseService {
  constructor() {
    super('schedule');
  }

  public getAllDriversSchedule = (
    terminalId: number,
    date: string,
    commodityId: number,
    limitSize: number,
    showSupplementals: boolean,
    isBasicView: boolean,
    params?: any
  ): AxiosPromise<any> => {
    let urlFix = params ? `&selectedLoadId=${params.selectedLoadId}&lastDropReturn=${params.lastDropReturn}` : ``;
    const urlDefault = isBasicView
      ? `dispatchBoard/filter/${terminalId}/${date}/${commodityId}?limitSize=${limitSize}&showSupplementals=${showSupplementals}`
      : `dispatchBoard/advancedFilter/${terminalId}/${date}/${commodityId}`;
    return this.httpAxios
      .get(isBasicView ? urlDefault + urlFix : urlDefault)
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public getSingleDriversSchedule = (
    terminalId: number,
    date: string,
    commodityId: number,
    limitSize: number,
    showSupplementals: boolean,
    params?: any
  ): AxiosPromise<any> => {
    let urlFix = params
      ? `&selectedLoadId=${params.selectedLoadId}&lastDropReturn=${params.lastDropReturn}&driverId=${params.driverId}`
      : ``;
    const urlDefault = `dispatchBoard/filter/${terminalId}/${date}/${commodityId}?limitSize=${limitSize}&showSupplementals=${showSupplementals}`;
    return this.httpAxios
      .get(urlDefault + urlFix)
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public getAllDriversScheduleLoads = (
    terminalId: number,
    date: string,
    commodityId: number,
    limitSize: number,
    driverId: string | number,
    page: number,
    showSupplementals: boolean
  ): AxiosPromise<any> => {
    return this.httpAxios
      .get(
        `dispatchBoard/driver/${terminalId}/${date}/${commodityId}?limitSize=${limitSize}&driverId=${driverId}&page=${page}&showSupplementals=${showSupplementals}`
      )
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public dropAllLoadByDriver = (data: any): AxiosPromise<any> => {
    return this.httpAxios
      .put(`dropAllLoadByDriver`, data)
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public dropLoadMultiple = (data: any): AxiosPromise<any> => {
    return this.httpAxios
      .put(`dropLoadMultiple`, data)
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public rearrangeLoad = (path: string, data: any): AxiosPromise<any> => {
    return this.httpAxios
      .post(`rearrangeScheduleEntry/${path}`, data)
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public assignLoadFromTableToDriver = (params: any): AxiosPromise<any> => {
    return this.httpAxios
      .post(``, params)
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public distanceGeocodePair = (path: string, params: any): AxiosPromise<any> => {
    return this.httpAxios
      .get(`distanceGeoCodePair/${path}`, { params })
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public getDHM = (path: string): AxiosPromise<any> => {
    return this.httpAxios
      .get(`driverDHM/${path}`)
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public actionDateBase = (
    driverId: number | string,
    idUser: number | string,
    remoteRequestType: 'UPLOAD_DB' | 'DELETE_TRANSACTIONS' | 'LAUNCH_RESCUE_ME'
  ): AxiosPromise<any> => {
    return this.httpAxios
      .post(`saveRemoteRequest/${driverId}/${idUser}/${remoteRequestType}`, {})
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public sendShiftEmail = (params: any): AxiosPromise<any> => {
    return this.httpAxios
      .post(`shiftEmail`, { ...params })
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public recalculateShiftTimesAndMiles = (driverId: number, driverShiftDate: string): AxiosPromise<any> => {
    return genericService
      .create('loadrouting/calculate', {
        driverId,
        driverShiftDate
      })
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };
}

const dispatchScheduleService = new DispatchScheduleService();
export default dispatchScheduleService;
